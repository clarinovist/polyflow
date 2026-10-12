import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TelegramAssistantLinkService } from '../assistant-link-service';

const NOW = new Date('2026-10-12T00:00:00.000Z');

function fixture() {
    const tokens = new Map<string, Record<string, any>>();
    const links = new Map<string, Record<string, any>>();
    const account = {
        id: 'account-a',
        status: 'ACTIVE',
        revocationVersion: 0,
    };
    const membership = {
        id: 'membership-a',
        globalAccountId: account.id,
        tenantId: 'tenant-a',
        tenantUserId: 'user-a',
        status: 'ACTIVE',
        membershipVersion: 0,
        tenant: {
            id: 'tenant-a',
            name: 'Tenant A',
            dbUrl: 'postgres://tenant-a',
            status: 'ACTIVE',
        },
        globalAccount: account,
        createdAt: NOW,
    };
    const auditCreate = vi.fn(async () => ({}));
    let commandResult: Record<string, any> | null = null;
    const updateClaims = new Map<string, string>();
    const tx: Record<string, any> = {
        globalAccount: {
            findFirst: vi.fn(async ({ where }) =>
                where.id === account.id && where.status === account.status
                    ? account
                    : null,
            ),
        },
        telegramAssistantLinkToken: {
            create: vi.fn(async ({ data }) => {
                const row = {
                    id: `token-${tokens.size + 1}`,
                    status: 'PENDING',
                    usedAt: null,
                    revokedAt: null,
                    globalAccount: account,
                    ...data,
                };
                tokens.set(data.tokenDigest, row);
                return row;
            }),
            findUnique: vi.fn(async ({ where }) =>
                tokens.get(where.tokenDigest) ?? null,
            ),
            updateMany: vi.fn(async ({ where, data }) => {
                let count = 0;
                for (const row of tokens.values()) {
                    if (
                        (where.id === undefined || row.id === where.id) &&
                        (where.globalAccountId === undefined ||
                            row.globalAccountId === where.globalAccountId) &&
                        (where.status === undefined ||
                            row.status === where.status) &&
                        (where.expiresAt === undefined ||
                            row.expiresAt > where.expiresAt.gt)
                    ) {
                        Object.assign(row, data);
                        count++;
                    }
                }
                return { count };
            }),
        },
        telegramAssistantLink: {
            findUnique: vi.fn(async ({ where }) => {
                if (where.botKey_telegramUserId) {
                    const key = `${where.botKey_telegramUserId.botKey}:${where.botKey_telegramUserId.telegramUserId}`;
                    return links.get(key) ?? null;
                }
                return (
                    [...links.values()].find(
                        (row) =>
                            row.globalAccountId === where.globalAccountId,
                    ) ?? null
                );
            }),
            findUniqueOrThrow: vi.fn(async ({ where }) => {
                const row = where.botKey_telegramUserId
                    ? links.get(
                          `${where.botKey_telegramUserId.botKey}:${where.botKey_telegramUserId.telegramUserId}`,
                      )
                    : [...links.values()].find(
                          (item) =>
                              item.globalAccountId === where.globalAccountId,
                      );
                if (!row) throw new Error('not found');
                return row;
            }),
            create: vi.fn(async ({ data }) => {
                const row = {
                    id: 'link-a',
                    status: 'ACTIVE',
                    selectionVersion: 0,
                    selectedTenantId: null,
                    selectedMembershipId: null,
                    selectedTenantUserId: null,
                    activeConversationId: null,
                    globalAccount: account,
                    ...data,
                };
                links.set(`${data.botKey}:${data.telegramUserId}`, row);
                return row;
            }),
            update: vi.fn(async ({ where, data }) => {
                const row = [...links.values()].find(
                    (item) =>
                        item.id === where.id ||
                        item.globalAccountId === where.globalAccountId,
                )!;
                apply(row, data);
                return row;
            }),
            updateMany: vi.fn(async ({ where, data }) => {
                const row = [...links.values()].find(
                    (item) =>
                        (where.id === undefined || item.id === where.id) &&
                        (where.botKey === undefined || item.botKey === where.botKey) &&
                        (where.telegramUserId === undefined ||
                            item.telegramUserId === where.telegramUserId) &&
                        (where.telegramChatId === undefined ||
                            item.telegramChatId === where.telegramChatId) &&
                        (where.globalAccountId === undefined ||
                            item.globalAccountId === where.globalAccountId) &&
                        (where.selectionVersion === undefined ||
                            item.selectionVersion === where.selectionVersion) &&
                        (where.status === undefined || item.status === where.status),
                );
                if (!row) return { count: 0 };
                apply(row, data);
                return { count: 1 };
            }),
        },
        tenantMembership: {
            findMany: vi.fn(async ({ where }) =>
                where.globalAccountId === account.id &&
                membership.status === 'ACTIVE' &&
                membership.tenant.status === 'ACTIVE'
                    ? [membership]
                    : [],
            ),
            findFirst: vi.fn(async ({ where }) =>
                where.id === membership.id &&
                where.globalAccountId === account.id &&
                where.tenantId === membership.tenantId &&
                where.tenantUserId === membership.tenantUserId &&
                membership.status === 'ACTIVE' &&
                membership.tenant.status === 'ACTIVE'
                    ? membership
                    : null,
            ),
        },
        telegramUpdateLog: {
            findUnique: vi.fn(async () => commandResult),
            updateMany: vi.fn(async ({ where, data }) => {
                if (
                    where.id &&
                    updateClaims.get(where.id) !== where.claimToken
                ) {
                    return { count: 0 };
                }
                if (data.responseText) {
                    commandResult = {
                        responseText: data.responseText,
                        replyMarkup: data.replyMarkup ?? null,
                    };
                }
                return { count: 1 };
            }),
        },
        telegramAssistantAuditLog: { create: auditCreate },
    };
    const main = {
        ...tx,
        $transaction: vi.fn(async (operation) => operation(tx)),
    };
    const actor = {
        isActive: true,
        isSuperAdmin: false,
        authMode: 'CENTRAL',
        centralAccountId: account.id,
        centralAuthVersion: 0,
    };
    const loadTenantDb = vi.fn(() => ({
        user: { findUnique: vi.fn(async () => actor) },
    }));
    return {
        main,
        tx,
        links,
        tokens,
        account,
        actor,
        membership,
        updateClaims,
        clearCommandResult: () => {
            commandResult = null;
        },
        service: new TelegramAssistantLinkService(
            main as never,
            loadTenantDb as never,
            () => NOW,
        ),
    };
}

function apply(row: Record<string, any>, data: Record<string, any>) {
    for (const [key, value] of Object.entries(data)) {
        if (value && typeof value === 'object' && 'increment' in value) {
            row[key] += value.increment;
        } else row[key] = value;
    }
}

const identity = {
    botKey: 'assistant-v1',
    telegramUserId: '12345',
    telegramChatId: '12345',
};
const secret = 's'.repeat(32);

beforeEach(() => vi.clearAllMocks());

describe('TelegramAssistantLinkService', () => {
    it('rejects LOCAL/superadmin sessions and persists only a digest', async () => {
        const f = fixture();
        await expect(
            f.service.createLinkToken({ globalAccountId: undefined }),
        ).rejects.toMatchObject({ code: 'CENTRAL_REQUIRED' });
        await expect(
            f.service.createLinkToken({
                globalAccountId: 'account-a',
                isSuperAdmin: true,
            }),
        ).rejects.toMatchObject({ code: 'CENTRAL_REQUIRED' });
        f.actor.authMode = 'LOCAL';
        await expect(
            f.service.createLinkToken({ globalAccountId: 'account-a' }),
        ).rejects.toMatchObject({ code: 'CENTRAL_REQUIRED' });
        f.actor.authMode = 'CENTRAL';

        const created = await f.service.createLinkToken({
            globalAccountId: 'account-a',
        });
        expect(created.expiresAt.getTime() - NOW.getTime()).toBe(600_000);
        expect([...f.tokens.keys()]).not.toContain(created.token);
        expect([...f.tokens.keys()][0]).toMatch(/^[a-f0-9]{64}$/);
    });

    it('rejects expired tokens before linking', async () => {
        const f = fixture();
        const created = await f.service.createLinkToken({
            globalAccountId: 'account-a',
        });
        [...f.tokens.values()][0].expiresAt = new Date(NOW.getTime() - 1);
        await expect(
            f.service.consumeLinkToken({ ...identity, token: created.token }),
        ).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
        expect(f.links.size).toBe(0);
    });

    it('consumes once atomically and rejects replay/conflicting Telegram ownership', async () => {
        const f = fixture();
        const created = await f.service.createLinkToken({
            globalAccountId: 'account-a',
        });
        const [first, replay] = await Promise.allSettled([
            f.service.consumeLinkToken({ ...identity, token: created.token }),
            f.service.consumeLinkToken({ ...identity, token: created.token }),
        ]);
        expect([first.status, replay.status].sort()).toEqual([
            'fulfilled',
            'rejected',
        ]);
        const rejected = [first, replay].find(
            (result) => result.status === 'rejected',
        ) as PromiseRejectedResult;
        expect(rejected.reason).toMatchObject({ code: 'TOKEN_INVALID' });

        const another = await f.service.createLinkToken({
            globalAccountId: 'account-a',
        });
        await expect(
            f.service.consumeLinkToken({
                ...identity,
                telegramUserId: '99999',
                telegramChatId: '99999',
                token: another.token,
            }),
        ).rejects.toMatchObject({ code: 'TOKEN_CONFLICT' });
    });

    it('validates active CENTRAL actor and callback HMAC/version/membership ownership', async () => {
        const f = fixture();
        const token = await f.service.createLinkToken({
            globalAccountId: 'account-a',
        });
        await f.service.consumeLinkToken({ ...identity, token: token.token });
        const listed = await f.service.listActiveWorkspaces(identity);
        expect(listed.workspaces).toEqual([
            expect.objectContaining({
                membershipId: 'membership-a',
                tenantId: 'tenant-a',
                tenantUserId: 'user-a',
            }),
        ]);
        const callback = f.service.createTenantCallback({
            membershipId: 'membership-a',
            selectionVersion: listed.selectionVersion,
            secret,
        });
        await expect(
            f.service.selectTenant({ ...identity, callbackData: callback, secret }),
        ).resolves.toMatchObject({ tenantName: 'Tenant A' });
        await expect(
            f.service.selectTenant({ ...identity, callbackData: callback, secret }),
        ).rejects.toMatchObject({ code: 'CALLBACK_INVALID' });
        await expect(
            f.service.selectTenant({
                ...identity,
                callbackData: `${callback.slice(0, -1)}x`,
                secret,
            }),
        ).rejects.toMatchObject({ code: 'CALLBACK_INVALID' });
        const otherMembership = f.service.createTenantCallback({
            membershipId: 'membership-b',
            selectionVersion: listed.selectionVersion,
            secret,
        });
        await expect(
            f.service.selectTenant({
                ...identity,
                callbackData: otherMembership,
                secret,
            }),
        ).rejects.toMatchObject({ code: 'CALLBACK_INVALID' });
    });

    it('fails closed for inactive account, membership, and tenant', async () => {
        const inactiveAccount = fixture();
        inactiveAccount.account.status = 'SUSPENDED';
        await expect(
            inactiveAccount.service.createLinkToken({
                globalAccountId: 'account-a',
            }),
        ).rejects.toMatchObject({ code: 'CENTRAL_REQUIRED' });

        for (const deactivate of [
            (f: ReturnType<typeof fixture>) => {
                f.membership.status = 'REVOKED';
            },
            (f: ReturnType<typeof fixture>) => {
                f.membership.tenant.status = 'SUSPENDED';
            },
        ]) {
            const f = fixture();
            const token = await f.service.createLinkToken({
                globalAccountId: 'account-a',
            });
            await f.service.consumeLinkToken({ ...identity, token: token.token });
            deactivate(f);
            await expect(f.service.listActiveWorkspaces(identity)).resolves.toMatchObject({
                workspaces: [],
            });
        }
    });

    it.each([
        { isActive: false },
        { isSuperAdmin: true },
        { authMode: 'LOCAL' },
        { centralAccountId: 'other-account' },
    ])('fails closed for invalid local actor %j', async (patch) => {
        const f = fixture();
        const token = await f.service.createLinkToken({
            globalAccountId: 'account-a',
        });
        await f.service.consumeLinkToken({ ...identity, token: token.token });
        Object.assign(f.actor, patch);
        await expect(f.service.listActiveWorkspaces(identity)).resolves.toMatchObject({
            workspaces: [],
        });
    });

    it('rejects stale selection epochs after A-to-B and same-tenant reselection', async () => {
        const f = fixture();
        const token = await f.service.createLinkToken({
            globalAccountId: 'account-a',
        });
        await f.service.consumeLinkToken({ ...identity, token: token.token });
        const listed = await f.service.listActiveWorkspaces(identity);
        const callback = f.service.createTenantCallback({
            membershipId: 'membership-a',
            selectionVersion: listed.selectionVersion,
            secret,
        });
        const original = await f.service.selectTenant({
            ...identity,
            callbackData: callback,
            secret,
        });
        await expect(
            f.service.resolveSelectedAuthority({
                ...identity,
                linkId: original.linkId,
                globalAccountId: original.globalAccountId,
                membershipId: original.membershipId,
                tenantId: original.tenantId,
                tenantUserId: original.tenantUserId,
                selectionVersion: original.selectionVersion,
            }),
        ).resolves.toMatchObject({ selectionVersion: 1 });

        // Re-select the same tenant at a new epoch. Tenant/user ids alone must
        // not revive the old question authority.
        const link = [...f.links.values()][0];
        link.selectionVersion += 1;
        await expect(
            f.service.resolveSelectedAuthority({
                ...identity,
                linkId: original.linkId,
                globalAccountId: original.globalAccountId,
                membershipId: original.membershipId,
                tenantId: original.tenantId,
                tenantUserId: original.tenantUserId,
                selectionVersion: original.selectionVersion,
            }),
        ).rejects.toMatchObject({ code: 'AUTHORITY_REVOKED' });

        // A-to-B is also denied even if the old membership remains active.
        link.selectedTenantId = 'tenant-b';
        link.selectedMembershipId = 'membership-b';
        link.selectedTenantUserId = 'user-b';
        await expect(
            f.service.resolveSelectedAuthority({
                ...identity,
                linkId: original.linkId,
                globalAccountId: original.globalAccountId,
                membershipId: original.membershipId,
                tenantId: original.tenantId,
                tenantUserId: original.tenantUserId,
                selectionVersion: original.selectionVersion,
            }),
        ).rejects.toMatchObject({ code: 'AUTHORITY_REVOKED' });
    });

    it.each([
        {
            label: 'membership revoke and reactivation',
            mutate: (f: ReturnType<typeof fixture>) => {
                f.membership.membershipVersion++;
            },
        },
        {
            label: 'account suspend and re-enable',
            mutate: (f: ReturnType<typeof fixture>) => {
                f.account.revocationVersion++;
            },
        },
        {
            label: 'local CENTRAL actor auth epoch change',
            mutate: (f: ReturnType<typeof fixture>) => {
                f.actor.centralAuthVersion++;
            },
        },
    ])('never revives an old request after $label', async ({ mutate }) => {
        const f = fixture();
        const token = await f.service.createLinkToken({
            globalAccountId: 'account-a',
        });
        await f.service.consumeLinkToken({ ...identity, token: token.token });
        const listed = await f.service.listActiveWorkspaces(identity);
        const authority = await f.service.selectTenant({
            ...identity,
            callbackData: f.service.createTenantCallback({
                membershipId: 'membership-a',
                selectionVersion: listed.selectionVersion,
                secret,
            }),
            secret,
        });
        mutate(f);
        await expect(
            f.service.resolveSelectedAuthority({
                ...identity,
                linkId: authority.linkId,
                globalAccountId: authority.globalAccountId,
                membershipId: authority.membershipId,
                tenantId: authority.tenantId,
                tenantUserId: authority.tenantUserId,
                selectionVersion: authority.selectionVersion,
                globalRevocationVersion: authority.globalRevocationVersion,
                membershipVersion: authority.membershipVersion,
                centralAuthVersion: authority.centralAuthVersion,
            }),
        ).rejects.toMatchObject({ code: 'AUTHORITY_REVOKED' });
    });

    it('never revives an old epoch after unlink and relink to the same tenant', async () => {
        const f = fixture();
        const firstToken = await f.service.createLinkToken({
            globalAccountId: 'account-a',
        });
        await f.service.consumeLinkToken({ ...identity, token: firstToken.token });
        const listed = await f.service.listActiveWorkspaces(identity);
        const first = await f.service.selectTenant({
            ...identity,
            callbackData: f.service.createTenantCallback({
                membershipId: 'membership-a',
                selectionVersion: listed.selectionVersion,
                secret,
            }),
            secret,
        });
        await f.service.unlink(identity);
        const relinkToken = await f.service.createLinkToken({
            globalAccountId: 'account-a',
        });
        await f.service.consumeLinkToken({
            ...identity,
            token: relinkToken.token,
        });
        const relisted = await f.service.listActiveWorkspaces(identity);
        await f.service.selectTenant({
            ...identity,
            callbackData: f.service.createTenantCallback({
                membershipId: 'membership-a',
                selectionVersion: relisted.selectionVersion,
                secret,
            }),
            secret,
        });
        await expect(
            f.service.resolveSelectedAuthority({
                ...identity,
                linkId: first.linkId,
                globalAccountId: first.globalAccountId,
                membershipId: first.membershipId,
                tenantId: first.tenantId,
                tenantUserId: first.tenantUserId,
                selectionVersion: first.selectionVersion,
            }),
        ).rejects.toMatchObject({ code: 'AUTHORITY_REVOKED' });
    });

    it('replays the successful /start result after a crash without re-consuming the token', async () => {
        const f = fixture();
        const token = await f.service.createLinkToken({
            globalAccountId: 'account-a',
        });
        const requestId = '11111111-1111-4111-8111-111111111111';
        const result = {
            text: 'Akun berhasil ditautkan. Pilih workspace aktif dengan /tenant.',
        };
        const updateRow: { responseText: string | null } = {
            responseText: null,
        };
        f.tx.telegramUpdateLog.findUnique.mockImplementation(
            async () => updateRow,
        );
        f.tx.telegramUpdateLog.updateMany.mockImplementation(
            async ({ data }: { data: { responseText: string } }) => {
                updateRow.responseText = data.responseText;
                return { count: 1 };
            },
        );
        await expect(
            f.service.consumeLinkTokenDigest({
                ...identity,
                tokenDigest: [...f.tokens.keys()][0],
                requestId,
                claimToken: 'owner-a',
                result,
            }),
        ).resolves.toEqual({ result });
        expect([...f.tokens.values()][0].status).toBe('CONSUMED');
        const mutations = f.tx.telegramAssistantLink.create.mock.calls.length;
        expect(updateRow.responseText).toBe(result.text);

        // Crash after commit but before delivery: retry must use the bounded
        // authoritative result and never re-consume the token.
        await expect(
            f.service.consumeLinkTokenDigest({
                ...identity,
                tokenDigest: [...f.tokens.keys()][0],
                requestId,
                claimToken: 'owner-b',
                result,
            }),
        ).resolves.toEqual({ result });
        expect(f.tx.telegramAssistantLink.create).toHaveBeenCalledTimes(mutations);
        expect(token.token).not.toBe([...f.tokens.keys()][0]);
    });

    it('audits successful tenant selection exactly once with mutation and command result', async () => {
        const f = fixture();
        const token = await f.service.createLinkToken({
            globalAccountId: 'account-a',
        });
        await f.service.consumeLinkToken({ ...identity, token: token.token });
        const listed = await f.service.listActiveWorkspaces(identity);
        const input = {
            ...identity,
            callbackData: f.service.createTenantCallback({
                membershipId: 'membership-a',
                selectionVersion: listed.selectionVersion,
                secret,
            }),
            secret,
            updateId: 'tenant-selection-update',
            requestId: '22222222-2222-4222-8222-222222222222',
            claimToken: 'owner-a',
        };

        const result = await f.service.selectTenant(input);
        await expect(
            f.service.selectTenant({ ...input, claimToken: 'owner-b' }),
        ).resolves.toEqual(result);

        const selectionAudits =
            f.tx.telegramAssistantAuditLog.create.mock.calls
                .map(([call]: any[]) => call.data)
                .filter(({ action }: { action: string }) =>
                    action === 'TENANT_SELECTED',
                );
        expect(selectionAudits).toEqual([
            expect.objectContaining({
                action: 'TENANT_SELECTED',
                outcome: 'SUCCESS',
                globalAccountId: 'account-a',
                tenantId: 'tenant-a',
                membershipId: 'membership-a',
                updateIdHash: expect.stringMatching(/^[a-f0-9]{32}$/),
            }),
        ]);
        const selectionAuditIndex =
            f.tx.telegramAssistantAuditLog.create.mock.calls.findIndex(
                ([call]: any[]) => call.data.action === 'TENANT_SELECTED',
            );
        expect(
            f.tx.telegramAssistantAuditLog.create.mock.invocationCallOrder[
                selectionAuditIndex
            ],
        ).toBeLessThan(
            f.tx.telegramUpdateLog.updateMany.mock.invocationCallOrder.at(-1)!,
        );
    });

    it('replays the successful tenant-selection result after a crash without advancing selection again', async () => {
        const f = fixture();
        const token = await f.service.createLinkToken({
            globalAccountId: 'account-a',
        });
        await f.service.consumeLinkToken({ ...identity, token: token.token });
        const listed = await f.service.listActiveWorkspaces(identity);
        const callbackData = f.service.createTenantCallback({
            membershipId: 'membership-a',
            selectionVersion: listed.selectionVersion,
            secret,
        });
        const input = {
            ...identity,
            callbackData,
            secret,
            requestId: '22222222-2222-4222-8222-222222222222',
            claimToken: 'owner-a',
        };
        const updateRow: { responseText: string | null } = {
            responseText: null,
        };
        f.tx.telegramUpdateLog.findUnique.mockImplementation(
            async () => updateRow,
        );
        f.tx.telegramUpdateLog.updateMany.mockImplementation(
            async ({ data }: { data: { responseText: string } }) => {
                updateRow.responseText = data.responseText;
                return { count: 1 };
            },
        );
        const result = await f.service.selectTenant(input);
        expect(result.text).toContain('Workspace aktif: Tenant A');
        const link = [...f.links.values()][0];
        const version = link.selectionVersion;
        expect(updateRow.responseText).toBe(result.text);

        // Crash after commit but before callback delivery: stale callback data
        // is not evaluated again because the request result is already final.
        await expect(
            f.service.selectTenant({ ...input, claimToken: 'owner-b' }),
        ).resolves.toEqual(result);
        expect(link.selectionVersion).toBe(version);
    });

    it('replays the successful unlink result after a crash without misreporting no active link', async () => {
        const f = fixture();
        const token = await f.service.createLinkToken({
            globalAccountId: 'account-a',
        });
        await f.service.consumeLinkToken({ ...identity, token: token.token });
        const input = {
            ...identity,
            requestId: '33333333-3333-4333-8333-333333333333',
            claimToken: 'owner-a',
        };
        const updateRow: { responseText: string | null } = {
            responseText: null,
        };
        f.tx.telegramUpdateLog.findUnique.mockImplementation(
            async () => updateRow,
        );
        f.tx.telegramUpdateLog.updateMany.mockImplementation(
            async ({ data }: { data: { responseText: string } }) => {
                updateRow.responseText = data.responseText;
                return { count: 1 };
            },
        );
        const result = await f.service.unlink(input);
        expect(result).toEqual({ text: 'Tautan akun Telegram sudah diputus.' });
        const mutationCount = f.tx.telegramAssistantLink.update.mock.calls.length;
        expect(updateRow.responseText).toBe(
            typeof result === 'object' ? result.text : null,
        );

        // Crash after commit but before delivery: retry reports the original
        // success rather than inspecting the now-revoked link.
        await expect(
            f.service.unlink({ ...input, claimToken: 'owner-b' }),
        ).resolves.toEqual(result);
        expect(f.tx.telegramAssistantLink.update).toHaveBeenCalledTimes(
            mutationCount,
        );
    });

    it('audits expired/conflicting token and stale callback rejections with hashed ids', async () => {
        const expired = fixture();
        await expired.service.createLinkToken({
            globalAccountId: 'account-a',
        });
        [...expired.tokens.values()][0].expiresAt = new Date(
            NOW.getTime() - 1,
        );
        await expect(
            expired.service.consumeLinkTokenDigest({
                ...identity,
                updateId: 'update-expired',
                tokenDigest: [...expired.tokens.keys()][0],
            }),
        ).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });

        const conflict = fixture();
        const first = await conflict.service.createLinkToken({
            globalAccountId: 'account-a',
        });
        await conflict.service.consumeLinkToken({
            ...identity,
            token: first.token,
        });
        await conflict.service.createLinkToken({
            globalAccountId: 'account-a',
        });
        await expect(
            conflict.service.consumeLinkTokenDigest({
                ...identity,
                telegramUserId: '99999',
                telegramChatId: '99999',
                updateId: 'update-conflict',
                tokenDigest: [...conflict.tokens.keys()].at(-1)!,
            }),
        ).rejects.toMatchObject({ code: 'TOKEN_CONFLICT' });

        const stale = fixture();
        const token = await stale.service.createLinkToken({
            globalAccountId: 'account-a',
        });
        await stale.service.consumeLinkToken({
            ...identity,
            token: token.token,
        });
        const listed = await stale.service.listActiveWorkspaces(identity);
        const callbackData = stale.service.createTenantCallback({
            membershipId: 'membership-a',
            selectionVersion: listed.selectionVersion,
            secret,
        });
        await stale.service.selectTenant({
            ...identity,
            callbackData,
            secret,
        });
        await expect(
            stale.service.selectTenant({
                ...identity,
                callbackData,
                secret,
                updateId: 'update-stale-callback',
            }),
        ).rejects.toMatchObject({ code: 'CALLBACK_INVALID' });

        const audits = [expired, conflict, stale].flatMap((f) =>
            f.tx.telegramAssistantAuditLog.create.mock.calls.map(
                ([call]: any[]) => call.data,
            ),
        );
        expect(audits).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    action: 'LINK_TOKEN_REJECTED',
                    outcome: 'TOKEN_EXPIRED',
                    updateIdHash: expect.stringMatching(/^[a-f0-9]{32}$/),
                }),
                expect.objectContaining({
                    action: 'LINK_TOKEN_REJECTED',
                    outcome: 'TOKEN_CONFLICT',
                    updateIdHash: expect.stringMatching(/^[a-f0-9]{32}$/),
                }),
                expect.objectContaining({
                    action: 'TENANT_SELECTION_REJECTED',
                    outcome: 'CALLBACK_INVALID',
                    updateIdHash: expect.stringMatching(/^[a-f0-9]{32}$/),
                }),
            ]),
        );
        expect(JSON.stringify(audits)).not.toMatch(
            /update-(expired|conflict|stale-callback)/,
        );
    });

    it('audits rejected token/callback attempts with bounded codes and no raw payload', async () => {
        const f = fixture();
        await expect(
            f.service.consumeLinkTokenDigest({
                ...identity,
                updateId: 'update-token-rejected',
                tokenDigest: 'raw-invalid-token',
            }),
        ).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
        await expect(
            f.service.selectTenant({
                ...identity,
                updateId: 'update-callback-rejected',
                callbackData: 'tampered-callback',
                secret,
            }),
        ).rejects.toMatchObject({ code: 'CALLBACK_INVALID' });
        const audits = f.tx.telegramAssistantAuditLog.create.mock.calls.map(
            ([call]: any[]) => call.data,
        );
        expect(audits).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    action: 'LINK_TOKEN_REJECTED',
                    outcome: 'TOKEN_INVALID',
                    details: { errorCode: 'TOKEN_INVALID' },
                }),
                expect.objectContaining({
                    action: 'TENANT_SELECTION_REJECTED',
                    outcome: 'CALLBACK_INVALID',
                    details: { errorCode: 'CALLBACK_INVALID' },
                }),
            ]),
        );
        expect(audits).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    telegramUserIdHash: expect.stringMatching(/^[a-f0-9]{32}$/),
                    updateIdHash: expect.stringMatching(/^[a-f0-9]{32}$/),
                }),
            ]),
        );
        expect(JSON.stringify(audits)).not.toContain('12345');
        expect(JSON.stringify(audits)).not.toContain('update-token-rejected');
        expect(JSON.stringify(audits)).not.toContain('update-callback-rejected');
        expect(JSON.stringify(audits)).not.toContain('raw-invalid-token');
        expect(JSON.stringify(audits)).not.toContain('tampered-callback');
    });

    it('returns persisted command results without replaying successful mutations', async () => {
        const f = fixture();
        const persisted = {
            responseText: 'Tautan akun Telegram sudah diputus.',
            replyMarkup: null,
        };
        f.tx.telegramUpdateLog.findUnique.mockResolvedValue(persisted);

        await expect(
            f.service.unlink({
                ...identity,
                requestId: '11111111-1111-4111-8111-111111111111',
                claimToken: 'owner-b',
            }),
        ).resolves.toEqual({ text: persisted.responseText });
        expect(f.tx.telegramAssistantLink.update).not.toHaveBeenCalled();

        await expect(
            f.service.consumeLinkTokenDigest({
                ...identity,
                tokenDigest: 'a'.repeat(64),
                requestId: '11111111-1111-4111-8111-111111111111',
                claimToken: 'owner-b',
                result: { text: 'linked' },
            }),
        ).resolves.toEqual({ result: { text: persisted.responseText } });
        expect(f.tx.telegramAssistantLinkToken.findUnique).not.toHaveBeenCalled();

        await expect(
            f.service.selectTenant({
                ...identity,
                callbackData: 'already-consumed',
                secret,
                requestId: '11111111-1111-4111-8111-111111111111',
                claimToken: 'owner-b',
            }),
        ).resolves.toEqual({ text: persisted.responseText });
        expect(f.tx.telegramAssistantLink.updateMany).not.toHaveBeenCalled();
    });

    it('atomically refuses conversation binding after claim ownership changes', async () => {
        const f = fixture();
        const token = await f.service.createLinkToken({
            globalAccountId: 'account-a',
        });
        await f.service.consumeLinkToken({ ...identity, token: token.token });
        const listed = await f.service.listActiveWorkspaces(identity);
        const authority = await f.service.selectTenant({
            ...identity,
            callbackData: f.service.createTenantCallback({
                membershipId: 'membership-a',
                selectionVersion: listed.selectionVersion,
                secret,
            }),
            secret,
        });
        f.updateClaims.set('update-row', 'owner-b');

        await expect(
            f.service.bindConversation({
                linkId: authority.linkId,
                selectionVersion: authority.selectionVersion,
                conversationId: 'conversation-stale',
                updateLogId: 'update-row',
                claimToken: 'owner-a',
                leaseUntil: new Date(NOW.getTime() + 155_000),
            }),
        ).rejects.toThrow('TELEGRAM_ASSISTANT_CLAIM_LOST');
        expect([...f.links.values()][0].activeConversationId).toBeNull();
        expect(f.tx.telegramAssistantLink.updateMany).toHaveBeenCalledTimes(1);
    });

    it('binds the conversation and claimed update in one transaction', async () => {
        const f = fixture();
        const token = await f.service.createLinkToken({
            globalAccountId: 'account-a',
        });
        await f.service.consumeLinkToken({ ...identity, token: token.token });
        const listed = await f.service.listActiveWorkspaces(identity);
        const authority = await f.service.selectTenant({
            ...identity,
            callbackData: f.service.createTenantCallback({
                membershipId: 'membership-a',
                selectionVersion: listed.selectionVersion,
                secret,
            }),
            secret,
        });
        f.updateClaims.set('update-row', 'owner-a');

        await expect(
            f.service.bindConversation({
                linkId: authority.linkId,
                selectionVersion: authority.selectionVersion,
                conversationId: 'conversation-owned',
                updateLogId: 'update-row',
                claimToken: 'owner-a',
                leaseUntil: new Date(NOW.getTime() + 155_000),
            }),
        ).resolves.toBeUndefined();
        expect([...f.links.values()][0].activeConversationId).toBe(
            'conversation-owned',
        );
        expect(f.tx.telegramUpdateLog.updateMany).toHaveBeenCalledWith({
            where: {
                id: 'update-row',
                claimToken: 'owner-a',
                status: 'PROCESSING',
            },
            data: {
                assistantConversationId: 'conversation-owned',
                leaseUntil: new Date(NOW.getTime() + 155_000),
            },
        });
    });

    it('unlink clears selection and increments version', async () => {
        const f = fixture();
        const token = await f.service.createLinkToken({
            globalAccountId: 'account-a',
        });
        await f.service.consumeLinkToken({ ...identity, token: token.token });
        await expect(f.service.unlink(identity)).resolves.toBe(true);
        const link = [...f.links.values()][0];
        expect(link).toMatchObject({
            status: 'REVOKED',
            selectedTenantId: null,
            activeConversationId: null,
            selectionVersion: 1,
        });
    });
});
