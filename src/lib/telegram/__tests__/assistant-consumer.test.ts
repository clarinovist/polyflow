import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    findMany: vi.fn(),
    updateMany: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    audit: vi.fn(),
}));
vi.mock('@/lib/core/prisma', () => ({
    getMainPrisma: () => ({
        telegramUpdateLog: {
            findMany: mocks.findMany,
            updateMany: mocks.updateMany,
            findFirst: mocks.findFirst,
            update: mocks.update,
        },
    }),
}));
vi.mock('@/services/telegram/assistant-link-service', async (load) => {
    const original = await load<
        typeof import('@/services/telegram/assistant-link-service')
    >();
    return { ...original, auditTelegramAssistant: mocks.audit };
});

import { TelegramAssistantClient } from '../assistant-client';
import { consumeTelegramAssistantBatch } from '../assistant-consumer';
import type { TelegramAssistantConfig } from '../assistant-config';

const config: TelegramAssistantConfig = {
    TELEGRAM_ASSISTANT_BOT_TOKEN: '1:'.padEnd(24, 'x'),
    TELEGRAM_ASSISTANT_BOT_KEY: 'assistant-v1',
    TELEGRAM_ASSISTANT_WEBHOOK_SECRET: 'w'.repeat(32),
    TELEGRAM_ASSISTANT_SELECTION_HMAC_SECRET: 'h'.repeat(32),
    TELEGRAM_ASSISTANT_BOT_USERNAME: 'polyflow_bot',
    TELEGRAM_ASSISTANT_PUBLIC_BASE_URL: 'https://example.test',
    TELEGRAM_ASSISTANT_KILL_SWITCH: false,
};
const row = {
    id: 'update-row',
    botKey: 'assistant-v1',
    updateId: '77',
    requestId: '11111111-1111-4111-8111-111111111111',
    telegramUserId: '123',
    telegramChatId: '123',
    callbackQueryId: null,
    callbackMembershipId: null,
    callbackSelectionVersion: null,
    question: 'stok HD1?',
    responseText: null,
    replyMarkup: null,
    type: 'message',
    placeholderMessageId: '900',
    assistantConversationId: null,
    authorityLinkId: null,
    authorityGlobalAccountId: null,
    authorityMembershipId: null,
    authorityTenantId: null,
    authorityTenantUserId: null,
    authoritySelectionVersion: null,
    authorityGlobalRevocationVersion: null,
    authorityMembershipVersion: null,
    authorityCentralAuthVersion: null,
    claimToken: null,
};
const authority = {
    linkId: 'link',
    botKey: 'assistant-v1',
    telegramUserId: '123',
    telegramChatId: '123',
    globalAccountId: 'account',
    selectionVersion: 4,
    globalRevocationVersion: 5,
    membershipVersion: 6,
    centralAuthVersion: 7,
    activeConversationId: 'conversation',
    membershipId: 'membership',
    tenantId: 'tenant-a',
    tenantUserId: 'user-a',
    tenantName: 'Tenant A',
};

beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([{ id: row.id }]);
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.findFirst.mockImplementation(async ({ where }) => ({
        ...row,
        claimToken: where.claimToken,
    }));
    mocks.update.mockResolvedValue({});
});

function workerSnapshot(status: 'queued' | 'done' = 'done') {
    return {
        requestId: row.requestId,
        publicConversationId: 'conversation',
        status,
        accepted: true as const,
        ...(status === 'done'
            ? {
                  response: {
                      answer: 'Stok tersedia.',
                      citations: [],
                      safety: { allowed: true },
                  },
              }
            : {}),
    };
}

describe('Telegram assistant durable consumer', () => {
    it('prevents expired owner A from calling Telegram or finishing after owner B reclaims', async () => {
        const state: Record<string, unknown> = {
            ...row,
            question: '/help',
            status: 'RESERVED',
            claimToken: null,
        };
        let ownerA = '';
        let firstOwnedRead = true;
        mocks.updateMany.mockImplementation(async ({ where, data }) => {
            if (where.OR) {
                ownerA = data.claimToken;
                Object.assign(state, data);
                return { count: 1 };
            }
            if (where.claimToken && state.claimToken !== where.claimToken) {
                return { count: 0 };
            }
            Object.assign(state, data);
            return { count: 1 };
        });
        mocks.findFirst.mockImplementation(async ({ where }) => {
            if (state.claimToken !== where.claimToken) return null;
            if (firstOwnedRead) {
                firstOwnedRead = false;
                const claimed = { ...state };
                // A's lease expires while it is paused. B reclaims the row
                // before A reaches its Telegram delivery boundary.
                state.claimToken = 'owner-b';
                return claimed;
            }
            return null;
        });
        const editMessageText = vi.fn(async () => undefined);
        const sendMessage = vi.fn(async () => ({ messageId: 'new-message' }));

        await consumeTelegramAssistantBatch({
            config,
            telegram: {
                editMessageText,
                sendMessage,
                answerCallbackQuery: vi.fn(),
            } as never,
        });

        expect(ownerA).toMatch(/^[0-9a-f-]{36}$/);
        expect(state).toMatchObject({
            status: 'PROCESSING',
            claimToken: 'owner-b',
        });
        expect(editMessageText).not.toHaveBeenCalled();
        expect(sendMessage).not.toHaveBeenCalled();
        expect(
            mocks.updateMany.mock.calls.some(
                ([call]) =>
                    call.where.claimToken === ownerA &&
                    call.data.status === 'DONE',
            ),
        ).toBe(false);
    });

    it('uses a live lease longer than the full worker timeout', async () => {
        const now = new Date('2026-10-12T00:00:00.000Z');
        mocks.findMany.mockResolvedValue([{ id: row.id }]);
        mocks.updateMany.mockResolvedValueOnce({ count: 0 });
        await consumeTelegramAssistantBatch({ config, now: () => now });
        const claim = mocks.updateMany.mock.calls[0][0];
        expect(claim.data.leaseUntil.getTime() - now.getTime()).toBeGreaterThan(
            125_000,
        );
        expect(claim.where.OR).toContainEqual({
            status: 'PROCESSING',
            leaseUntil: { lt: now },
        });
    });

    it('gives every candidate a full lease and prevents reclaiming live second work', async () => {
        const firstId = 'update-first';
        const secondId = 'update-second';
        const start = new Date('2026-10-12T00:00:00.000Z');
        const state = new Map([
            [
                firstId,
                {
                    status: 'RESERVED',
                    claimToken: null as string | null,
                    leaseUntil: null as Date | null,
                },
            ],
            [
                secondId,
                {
                    status: 'RESERVED',
                    claimToken: null as string | null,
                    leaseUntil: null as Date | null,
                },
            ],
        ]);
        let clock = start.getTime();
        let findManyCalls = 0;
        let findFirstCalls = 0;
        let competingResult: number | undefined;
        mocks.findMany.mockImplementation(async () =>
            findManyCalls++ === 0
                ? [{ id: firstId }, { id: secondId }]
                : [{ id: secondId }],
        );
        mocks.updateMany.mockImplementation(async ({ where, data }) => {
            if (!where.OR) return { count: 0 };
            const candidate = state.get(where.id)!;
            const claimNow = where.availableAt.lte as Date;
            const available =
                candidate.status !== 'PROCESSING' ||
                (!!candidate.leaseUntil && candidate.leaseUntil < claimNow);
            if (!available) return { count: 0 };
            candidate.status = data.status;
            candidate.claimToken = data.claimToken;
            candidate.leaseUntil = data.leaseUntil;
            return { count: 1 };
        });
        mocks.findFirst.mockImplementation(async () => {
            findFirstCalls++;
            if (findFirstCalls === 1) {
                // Candidate one consumes longer than the original lease window.
                clock += 160_000;
                return null;
            }
            // Candidate two remains live 150s after its own later claim. A
            // competing consumer must not be able to reclaim its 155s lease.
            clock += 150_000;
            competingResult = await consumeTelegramAssistantBatch({
                config,
                now: () => new Date(clock),
            });
            return null;
        });

        await consumeTelegramAssistantBatch({
            config,
            now: () => new Date(clock),
        });

        const claims = mocks.updateMany.mock.calls
            .map(([call]) => call)
            .filter((call) => call.where.OR);
        expect(claims).toHaveLength(3);
        expect(claims[1].where.availableAt.lte).toEqual(
            new Date(start.getTime() + 160_000),
        );
        expect(
            claims[1].data.leaseUntil.getTime() -
                claims[1].where.availableAt.lte.getTime(),
        ).toBe(155_000);
        expect(competingResult).toBe(0);
        expect(state.get(secondId)?.claimToken).toBe(
            claims[1].data.claimToken,
        );
    });

    it('retries the same stable request and edits the persisted placeholder', async () => {
        const editMessageText = vi.fn(async () => undefined);
        const sendMessage = vi.fn();
        const submit = vi.fn(async (envelope) => ({
            requestId: envelope.requestId,
            publicConversationId: 'conversation',
            status: 'queued',
            accepted: true as const,
        }));
        const status = vi.fn(async (envelope) => ({
            requestId: envelope.requestId,
            publicConversationId: 'conversation',
            status: 'done',
            accepted: true as const,
            response: {
                answer: 'Stok tersedia 10.',
                citations: [],
                safety: { allowed: true },
            },
        }));
        const links = {
            resolveSelectedAuthority: vi.fn(async () => authority),
            bindConversation: vi.fn(async () => undefined),
        };
        await expect(
            consumeTelegramAssistantBatch({
                config,
                telegram: {
                    editMessageText,
                    sendMessage,
                    answerCallbackQuery: vi.fn(),
                } as never,
                worker: { submit, status } as never,
                links: links as never,
            }),
        ).resolves.toBe(1);

        expect(sendMessage).not.toHaveBeenCalled();
        expect(editMessageText).toHaveBeenCalledTimes(1);
        expect(submit).toHaveBeenCalledWith(
            expect.objectContaining({
                requestId: row.requestId,
                tenantId: 'tenant-a',
                userId: 'user-a',
                channel: 'telegram',
                telegramAuthority: {
                    botKey: 'assistant-v1',
                    telegramUserId: '123',
                    telegramChatId: '123',
                    linkId: 'link',
                    globalAccountId: 'account',
                    membershipId: 'membership',
                    tenantId: 'tenant-a',
                    tenantUserId: 'user-a',
                    selectionVersion: 4,
                    globalRevocationVersion: 5,
                    membershipVersion: 6,
                    centralAuthVersion: 7,
                },
            }),
        );
        expect(status).toHaveBeenCalledWith(
            expect.objectContaining({ requestId: row.requestId }),
        );
        expect(editMessageText).toHaveBeenLastCalledWith(
            expect.objectContaining({
                messageId: '900',
                text: expect.stringContaining('Workspace aktif: Tenant A'),
            }),
        );
    });

    it('does nothing after a worker call if another owner changes the claim', async () => {
        let activeClaim = '';
        mocks.updateMany.mockImplementation(async ({ where, data }) => {
            if (where.OR) {
                activeClaim = data.claimToken;
                return { count: 1 };
            }
            if (where.claimToken && where.claimToken !== activeClaim) {
                return { count: 0 };
            }
            return { count: 1 };
        });
        mocks.findFirst.mockImplementation(async ({ where }) => ({
            ...row,
            claimToken: where.claimToken,
        }));
        const bindConversation = vi.fn();
        const editMessageText = vi.fn();
        const submit = vi.fn(async () => {
            activeClaim = 'owner-b';
            return workerSnapshot();
        });

        await consumeTelegramAssistantBatch({
            config,
            telegram: {
                editMessageText,
                sendMessage: vi.fn(),
                answerCallbackQuery: vi.fn(),
            } as never,
            worker: { submit, status: vi.fn() } as never,
            links: {
                resolveSelectedAuthority: vi.fn(async () => authority),
                bindConversation,
            } as never,
        });

        expect(bindConversation).not.toHaveBeenCalled();
        expect(mocks.audit).not.toHaveBeenCalledWith(
            expect.objectContaining({ action: 'ASSISTANT_SUBMITTED' }),
        );
        expect(editMessageText).not.toHaveBeenCalled();
        expect(
            mocks.updateMany.mock.calls.some(
                ([call]) =>
                    call.where.claimToken !== 'owner-b' &&
                    (call.data.assistantConversationId ||
                        call.data.status === 'DONE'),
            ),
        ).toBe(false);
    });

    it('does not deliver after a worker call if another owner changes the claim', async () => {
        let activeClaim = '';
        mocks.updateMany.mockImplementation(async ({ where, data }) => {
            if (where.OR) {
                activeClaim = data.claimToken;
                return { count: 1 };
            }
            if (where.claimToken && where.claimToken !== activeClaim) {
                return { count: 0 };
            }
            return { count: 1 };
        });
        mocks.findFirst.mockImplementation(async ({ where }) => ({
            ...row,
            claimToken: where.claimToken,
        }));
        const editMessageText = vi.fn();
        const submit = vi.fn(async () => {
            activeClaim = 'owner-b';
            return workerSnapshot();
        });
        const bindConversation = vi.fn();

        await consumeTelegramAssistantBatch({
            config,
            telegram: {
                editMessageText,
                sendMessage: vi.fn(),
                answerCallbackQuery: vi.fn(),
            } as never,
            worker: { submit, status: vi.fn() } as never,
            links: {
                resolveSelectedAuthority: vi.fn(async () => authority),
                bindConversation,
            } as never,
        });

        expect(submit).toHaveBeenCalledOnce();
        expect(editMessageText).not.toHaveBeenCalled();
        expect(bindConversation).not.toHaveBeenCalled();
        expect(mocks.audit).not.toHaveBeenCalledWith(
            expect.objectContaining({
                action: expect.stringMatching(
                    /ASSISTANT_SUBMITTED|DELIVERY_SENT/,
                ),
            }),
        );
        expect(
            mocks.updateMany.mock.calls.some(
                ([call]) =>
                    call.where.claimToken !== 'owner-b' &&
                    (call.data.assistantConversationId ||
                        call.data.status === 'DONE'),
            ),
        ).toBe(false);
    });

    it('does nothing after callback acknowledgement if another owner changes the claim', async () => {
        mocks.findFirst.mockImplementationOnce(async ({ where }) => ({
            ...row,
            type: 'callback',
            question: '/tenant-callback',
            callbackQueryId: 'callback-1',
            callbackMembershipId: 'membership',
            callbackSelectionVersion: 4,
            claimToken: where.claimToken,
        }));
        let activeClaim = '';
        mocks.updateMany.mockImplementation(async ({ where, data }) => {
            if (where.OR) {
                activeClaim = data.claimToken;
                return { count: 1 };
            }
            if (where.claimToken && where.claimToken !== activeClaim) {
                return { count: 0 };
            }
            return { count: 1 };
        });
        const sendMessage = vi.fn();
        const answerCallbackQuery = vi.fn(async () => {
            activeClaim = 'owner-b';
        });

        await consumeTelegramAssistantBatch({
            config,
            telegram: {
                sendMessage,
                editMessageText: vi.fn(),
                answerCallbackQuery,
            } as never,
            links: {
                selectTenantReference: vi.fn(async () => ({
                    text: 'Workspace aktif: Tenant A.',
                })),
            } as never,
        });

        expect(answerCallbackQuery).toHaveBeenCalledOnce();
        expect(sendMessage).not.toHaveBeenCalled();
        expect(
            mocks.updateMany.mock.calls.some(
                ([call]) =>
                    call.where.claimToken !== 'owner-b' &&
                    call.data.status === 'DONE',
            ),
        ).toBe(false);
    });

    it('persists the authoritative selection epoch before durable submission', async () => {
        const callOrder: string[] = [];
        mocks.updateMany.mockImplementation(async ({ data }) => {
            if (data.authorityLinkId) callOrder.push('persist-authority');
            return { count: 1 };
        });
        const submit = vi.fn(async () => {
            callOrder.push('submit');
            return {
                requestId: row.requestId,
                publicConversationId: 'conversation',
                status: 'done',
                accepted: true as const,
                response: {
                    answer: 'Stok tersedia.',
                    citations: [],
                    safety: { allowed: true },
                },
            };
        });
        await consumeTelegramAssistantBatch({
            config,
            now: () => new Date('2026-10-12T00:00:00.000Z'),
            telegram: {
                editMessageText: vi.fn(async () => undefined),
                sendMessage: vi.fn(),
                answerCallbackQuery: vi.fn(),
            } as never,
            worker: { submit, status: vi.fn() } as never,
            links: {
                resolveSelectedAuthority: vi.fn(async () => authority),
                bindConversation: vi.fn(async () => undefined),
            } as never,
        });
        expect(callOrder).toEqual(['persist-authority', 'submit']);
        expect(mocks.updateMany).toHaveBeenCalledWith({
            where: expect.objectContaining({
                id: row.id,
                authorityLinkId: null,
                authoritySelectionVersion: null,
            }),
            data: {
                authorityLinkId: 'link',
                authorityGlobalAccountId: 'account',
                authorityMembershipId: 'membership',
                authorityTenantId: 'tenant-a',
                authorityTenantUserId: 'user-a',
                authoritySelectionVersion: 4,
                authorityGlobalRevocationVersion: 5,
                authorityMembershipVersion: 6,
                authorityCentralAuthVersion: 7,
            },
        });
    });

    it('reconstructs WAITING from the persisted epoch and denies a switch without retargeting', async () => {
        mocks.findFirst.mockResolvedValueOnce({
            ...row,
            status: 'WAITING',
            assistantConversationId: 'conversation',
            authorityLinkId: 'link',
            authorityGlobalAccountId: 'account',
            authorityMembershipId: 'membership',
            authorityTenantId: 'tenant-a',
            authorityTenantUserId: 'user-a',
            authoritySelectionVersion: 4,
            authorityGlobalRevocationVersion: 5,
            authorityMembershipVersion: 6,
            authorityCentralAuthVersion: 7,
        });
        const links = {
            resolveSelectedAuthority: vi.fn(async (input) => {
                expect(input).toMatchObject({
                    linkId: 'link',
                    globalAccountId: 'account',
                    membershipId: 'membership',
                    tenantId: 'tenant-a',
                    tenantUserId: 'user-a',
                    selectionVersion: 4,
                    globalRevocationVersion: 5,
                    membershipVersion: 6,
                    centralAuthVersion: 7,
                });
                throw new (await import(
                    '@/services/telegram/assistant-link-service'
                )).TelegramAssistantLinkError(
                    'AUTHORITY_REVOKED',
                    'selection changed',
                );
            }),
        };
        const editMessageText = vi.fn(async () => undefined);
        const submit = vi.fn();
        const status = vi.fn();
        await consumeTelegramAssistantBatch({
            config,
            telegram: {
                editMessageText,
                sendMessage: vi.fn(),
                answerCallbackQuery: vi.fn(),
            } as never,
            worker: { submit, status } as never,
            links: links as never,
        });
        expect(submit).not.toHaveBeenCalled();
        expect(status).not.toHaveBeenCalled();
        expect(editMessageText).toHaveBeenCalledWith(
            expect.objectContaining({
                text: expect.stringContaining('pertanyaan ini sudah berubah'),
            }),
        );
    });

    it('reclaims only expired PROCESSING leases with the same atomic claim predicate', async () => {
        const now = new Date('2026-10-12T00:05:00.000Z');
        mocks.findMany.mockResolvedValue([]);
        await consumeTelegramAssistantBatch({ config, now: () => now });
        const where = mocks.findMany.mock.calls[0][0].where;
        expect(where.OR[0]).toMatchObject({
            status: { in: ['RESERVED', 'WAITING', 'FAILED'] },
            OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
        });
        expect(where.OR).toContainEqual({
            status: 'PROCESSING',
            leaseUntil: { lt: now },
        });

        mocks.findMany.mockResolvedValue([{ id: row.id }]);
        mocks.updateMany.mockResolvedValue({ count: 0 });
        await expect(
            Promise.all([
                consumeTelegramAssistantBatch({ config, now: () => now }),
                consumeTelegramAssistantBatch({ config, now: () => now }),
            ]),
        ).resolves.toEqual([0, 0]);
        expect(mocks.findFirst).not.toHaveBeenCalled();
        for (const call of mocks.updateMany.mock.calls) {
            expect(call[0].where.OR).toContainEqual({
                status: 'PROCESSING',
                leaseUntil: { lt: now },
            });
        }
    });

    it('uses only the normalized callback reference and never needs raw callback data after ingress', async () => {
        mocks.findFirst.mockImplementationOnce(async ({ where }) => ({
            ...row,
            type: 'callback',
            question: '/tenant-callback',
            callbackQueryId: 'callback-1',
            callbackMembershipId: 'membership',
            callbackSelectionVersion: 4,
            placeholderMessageId: null,
            claimToken: where.claimToken,
        }));
        const selectTenantReference = vi.fn(async () => ({
            text: 'Workspace aktif: Tenant A.',
        }));
        const answerCallbackQuery = vi.fn(async () => undefined);
        const sendMessage = vi.fn(async () => ({ messageId: '902' }));
        await consumeTelegramAssistantBatch({
            config,
            telegram: {
                sendMessage,
                editMessageText: vi.fn(),
                answerCallbackQuery,
            } as never,
            links: { selectTenantReference } as never,
        });
        expect(selectTenantReference).toHaveBeenCalledWith(
            expect.objectContaining({
                membershipId: 'membership',
                selectionVersion: 4,
                requestId: row.requestId,
                updateId: row.updateId,
                claimToken: expect.any(String),
            }),
        );
        expect(answerCallbackQuery).toHaveBeenCalledWith('callback-1');
        expect(JSON.stringify(selectTenantReference.mock.calls)).not.toContain(
            't1.',
        );
    });

    it.each([
        {
            linked: false,
            expected: 'Buat token tautan dari akun pusat Polyflow',
        },
        {
            linked: true,
            expected: 'Akun Telegram ini sudah tertaut',
        },
    ])(
        'handles /start without consuming a token when linked=$linked',
        async ({ linked, expected }) => {
            mocks.findFirst.mockResolvedValueOnce({
                ...row,
                question: '/start',
                placeholderMessageId: null,
            });
            const sendMessage = vi.fn(async () => ({ messageId: '901' }));
            const hasActiveLink = vi.fn(async () => linked);
            const consumeLinkTokenDigest = vi.fn();

            await consumeTelegramAssistantBatch({
                config,
                telegram: {
                    sendMessage,
                    editMessageText: vi.fn(),
                    answerCallbackQuery: vi.fn(),
                } as never,
                links: {
                    hasActiveLink,
                    consumeLinkTokenDigest,
                } as never,
            });

            expect(hasActiveLink).toHaveBeenCalledWith({
                botKey: 'assistant-v1',
                telegramUserId: '123',
                telegramChatId: '123',
            });
            expect(consumeLinkTokenDigest).not.toHaveBeenCalled();
            expect(sendMessage).toHaveBeenCalledWith(
                expect.objectContaining({ text: expect.stringContaining(expected) }),
            );
            expect(JSON.stringify(sendMessage.mock.calls)).not.toContain(
                'Akun berhasil ditautkan',
            );
        },
    );

    it('propagates /start link-status lookup failures for retry', async () => {
        mocks.findFirst.mockResolvedValueOnce({
            ...row,
            question: '/start',
            placeholderMessageId: null,
        });
        const sendMessage = vi.fn();
        await consumeTelegramAssistantBatch({
            config,
            telegram: {
                sendMessage,
                editMessageText: vi.fn(),
                answerCallbackQuery: vi.fn(),
            } as never,
            links: {
                hasActiveLink: vi.fn(async () => {
                    throw new Error('database unavailable');
                }),
            } as never,
        });
        expect(sendMessage).not.toHaveBeenCalled();
        expect(mocks.updateMany).toHaveBeenLastCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ status: 'FAILED' }),
            }),
        );
    });

    it('executes /start token linking and persists one workspace menu placeholder', async () => {
        mocks.findFirst.mockResolvedValueOnce({
            ...row,
            question: `/start-digest ${'a'.repeat(64)}`,
            placeholderMessageId: null,
        });
        const sendMessage = vi.fn(async () => ({ messageId: '901' }));
        const links = {
            consumeLinkTokenDigest: vi.fn(async () => ({
                globalAccountId: 'account',
                selectionVersion: 0,
            })),
            listActiveWorkspaces: vi.fn(async () => ({
                selectionVersion: 0,
                workspaces: [
                    {
                        membershipId: 'membership',
                        tenantId: 'tenant-a',
                        tenantUserId: 'user-a',
                        tenantName: 'Tenant A',
                    },
                ],
            })),
            createTenantCallback: vi.fn(() => 'signed-callback'),
        };
        await consumeTelegramAssistantBatch({
            config,
            telegram: {
                sendMessage,
                editMessageText: vi.fn(),
                answerCallbackQuery: vi.fn(),
            } as never,
            worker: { submit: vi.fn(), status: vi.fn() } as never,
            links: links as never,
        });
        expect(links.consumeLinkTokenDigest).toHaveBeenCalledWith(
            expect.objectContaining({ tokenDigest: 'a'.repeat(64) }),
        );
        expect(sendMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                text: 'Akun berhasil ditautkan. Pilih workspace aktif dengan /tenant.',
            }),
        );
    });

    it.each([
        {
            errorCode: 'LINK_REQUIRED',
            expected: 'Buat token dari sesi akun pusat Polyflow',
        },
        {
            errorCode: 'SELECTION_REQUIRED',
            expected: 'Pilih workspace aktif terlebih dahulu dengan /tenant',
        },
    ])(
        'returns the correct recovery copy for $errorCode before an epoch is persisted',
        async ({ errorCode, expected }) => {
            const { TelegramAssistantLinkError } = await import(
                '@/services/telegram/assistant-link-service'
            );
            const editMessageText = vi.fn(async () => undefined);
            await consumeTelegramAssistantBatch({
                config,
                telegram: {
                    editMessageText,
                    sendMessage: vi.fn(),
                    answerCallbackQuery: vi.fn(),
                } as never,
                worker: { submit: vi.fn(), status: vi.fn() } as never,
                links: {
                    resolveSelectedAuthority: vi.fn(async () => {
                        throw new TelegramAssistantLinkError(
                            errorCode as 'LINK_REQUIRED' | 'SELECTION_REQUIRED',
                            errorCode,
                        );
                    }),
                } as never,
            });
            expect(editMessageText).toHaveBeenCalledWith(
                expect.objectContaining({ text: expect.stringContaining(expected) }),
            );
        },
    );

    it.each([
        { status: 429, expected: 'FAILED' },
        { status: 400, expected: 'IGNORED' },
    ])(
        'settles Telegram HTTP $status delivery as $expected',
        async ({ status, expected }) => {
            mocks.findFirst.mockImplementationOnce(async ({ where }) => ({
                ...row,
                question: '/help',
                placeholderMessageId: null,
                claimToken: where.claimToken,
            }));
            const telegram = new TelegramAssistantClient({
                token: config.TELEGRAM_ASSISTANT_BOT_TOKEN,
                fetch: vi.fn(async () => ({
                    ok: false,
                    status,
                    headers: new Headers(
                        status === 429 ? { 'retry-after': '10' } : {},
                    ),
                    body: { cancel: vi.fn(async () => undefined) },
                })) as never,
            });
            await consumeTelegramAssistantBatch({
                config,
                telegram,
                links: {} as never,
            });
            expect(mocks.updateMany).toHaveBeenLastCalledWith({
                where: expect.objectContaining({
                    id: row.id,
                    claimToken: expect.any(String),
                }),
                data: expect.objectContaining({ status: expected }),
            });
        },
    );

    it('does not claim work while kill switch is active', async () => {
        await expect(
            consumeTelegramAssistantBatch({
                config: { ...config, TELEGRAM_ASSISTANT_KILL_SWITCH: true },
            }),
        ).resolves.toBe(0);
        expect(mocks.findMany).not.toHaveBeenCalled();
    });
});
