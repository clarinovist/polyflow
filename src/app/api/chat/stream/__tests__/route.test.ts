import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => {
    class MockNextResponse {
        status: number;
        _body: unknown;
        constructor(body?: unknown, init?: { status?: number }) {
            this._body = body;
            this.status = init?.status ?? 200;
        }
        async json() {
            return this._body;
        }
        static json(body: unknown, init?: { status?: number }) {
            return new MockNextResponse(body, init);
        }
    }
    return { NextResponse: MockNextResponse, NextRequest: class {} };
});

vi.mock('@/lib/core/tenant', () => ({
    withTenantRoute: (handler: (req: unknown) => unknown) => handler,
}));

const findUniqueMock = vi.fn().mockResolvedValue({ id: 'user-1' });
const verifySessionMock = vi.fn();

vi.mock('@/lib/core/prisma', () => ({
    getTenantIdFromContext: vi.fn(() => 'tenant-a'),
    prisma: { user: { findUnique: (...a: unknown[]) => findUniqueMock(...a) } },
}));

const authMock = vi.fn();
vi.mock('@/auth', () => ({ auth: () => authMock() }));
vi.mock('@/lib/bot/assistant-session', () => ({
    verifyAssistantSessionUser: (...a: unknown[]) => verifySessionMock(...a),
}));

const generateMock = vi.fn();
vi.mock('@/lib/bot/virtual-cs-service', () => ({
    generateVirtualCsReply: (...a: unknown[]) => generateMock(...a),
}));

const logMock = vi.fn().mockResolvedValue('interaction-9');
vi.mock('@/lib/bot/chat-audit', () => ({
    logVirtualCsEvent: (...a: unknown[]) => logMock(...a),
}));

vi.mock('@/lib/bot/product-scope', () => ({ POLYFLOW_PRODUCT_ID: 'polyflow' }));

import { POST } from '../route';
import { __resetChatRateLimit } from '@/lib/bot/chat-rate-limit';

type Handler = (req: unknown) => Promise<{
    status?: number;
    json?: () => Promise<unknown>;
    body?: ReadableStream<Uint8Array>;
    headers?: Headers;
}>;

function makeReq(body: unknown) {
    return { json: async () => body };
}

/** Kumpulkan seluruh event SSE, sudah membuang sentinel `[DONE]`. */
async function collectEvents(
    stream: ReadableStream<Uint8Array>,
): Promise<unknown[]> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let text = '';
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
    }
    return text
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim())
        .filter((raw) => raw && raw !== '[DONE]')
        .map((raw) => JSON.parse(raw));
}

describe('POST /api/chat/stream', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        __resetChatRateLimit();
        authMock.mockResolvedValue({
            user: { id: 'user-1', name: 'Filia' },
        });
        findUniqueMock.mockResolvedValue({ id: 'user-1' });
        verifySessionMock.mockResolvedValue({
            id: 'user-1',
            name: 'Filia',
            role: 'ADMIN',
            roles: ['ADMIN'],
            isSuperAdmin: false,
            allowedResources: ['/production', '/finance'],
        });
        logMock.mockResolvedValue('interaction-9');
    });

    it('menolak request tanpa sesi', async () => {
        authMock.mockResolvedValue(null);
        const res = await (POST as unknown as Handler)(makeReq({ question: 'halo' }));
        expect(res.status).toBe(401);
    });

    it('menolak pertanyaan kosong', async () => {
        const res = await (POST as unknown as Handler)(makeReq({ question: '   ' }));
        expect(res.status).toBe(400);
    });

    it('menolak pertanyaan melebihi 2000 karakter', async () => {
        const res = await (POST as unknown as Handler)(
            makeReq({ question: 'a'.repeat(2001) }),
        );
        expect(res.status).toBe(400);
    });

    it('menolak work context yang malformed', async () => {
        const res = await (POST as unknown as Handler)(
            makeReq({ question: 'cek invoice', workContext: { pathname: 42 } }),
        );
        expect(res.status).toBe(400);
    });

    it('menolak saat user tidak ada di DB tenant (session-tenant binding)', async () => {
        findUniqueMock.mockResolvedValue(null);
        verifySessionMock.mockResolvedValue(null);
        const res = await (POST as unknown as Handler)(makeReq({ question: 'cek stok' }));
        expect(res.status).toBe(403);
    });

    it('menolak saat kuota rate limit habis', async () => {
        for (let i = 0; i < 20; i++) {
            generateMock.mockResolvedValue({
                answer: 'ok',
                citations: [],
                safety: { allowed: true },
            });
            await (POST as unknown as Handler)(makeReq({ question: 'cek stok' }));
        }
        const res = await (POST as unknown as Handler)(makeReq({ question: 'cek stok' }));
        expect(res.status).toBe(429);
    });

    it('mengalirkan event tool + delta lalu done, diakhiri sentinel [DONE]', async () => {
        generateMock.mockImplementation(
            async (
                _input: unknown,
                ctx: { onEvent?: (e: unknown) => void },
            ) => {
                ctx.onEvent?.({
                    type: 'tool',
                    name: 'get_product_stock',
                    label: 'Mengecek stok barang',
                });
                ctx.onEvent?.({ type: 'delta', text: 'Stok ' });
                ctx.onEvent?.({ type: 'delta', text: 'tersedia.' });
                return {
                    answer: 'Stok tersedia.',
                    citations: [],
                    conversationId: 'conv-1',
                    confidence: 0.9,
                    safety: { allowed: true },
                };
            },
        );

        const res = await (POST as unknown as Handler)(
            makeReq({
                question: 'cek stok MP 15',
                workContext: { pathname: '/production/orders/order-1' },
            }),
        );

        expect(res.headers?.get('Content-Type')).toContain('text/event-stream');
        // Cegah Nginx menahan buffer sampai response selesai.
        expect(res.headers?.get('X-Accel-Buffering')).toBe('no');

        const events = (await collectEvents(res.body!)) as Array<{
            type: string;
            [k: string]: unknown;
        }>;

        expect(events.map((e) => e.type)).toEqual([
            'tool',
            'delta',
            'delta',
            'done',
        ]);
        expect(events[0].label).toBe('Mengecek stok barang');
        expect(generateMock.mock.calls[0][1]).toMatchObject({
            workContext: { pathname: '/production/orders/order-1' },
            permissionsVerified: true,
            sessionUser: { allowedResources: ['/production', '/finance'] },
        });

        const done = events[3] as unknown as { data: Record<string, unknown> };
        expect(done.data.answer).toBe('Stok tersedia.');
        expect(done.data.interactionId).toBe('interaction-9');
    });

    it('meneruskan citedSlugs, confidence, dan conversationId ke audit', async () => {
        generateMock.mockResolvedValue({
            answer: 'Jawaban lengkap dari knowledge base.',
            citations: [],
            citedArticles: [{ slug: 'cara-buat-so', title: 'Cara buat SO' }],
            conversationId: 'conv-7',
            confidence: 0.75,
            safety: { allowed: true },
        });

        const res = await (POST as unknown as Handler)(
            makeReq({ question: 'cara buat SO' }),
        );
        await collectEvents(res.body!);

        expect(logMock).toHaveBeenCalledTimes(1);
        const payload = logMock.mock.calls[0][0];
        expect(payload.citedSlugs).toEqual(['cara-buat-so']);
        expect(payload.confidence).toBe(0.75);
        expect(payload.conversationId).toBe('conv-7');
    });

    it('mengirim event error saat agentic loop gagal', async () => {
        generateMock.mockRejectedValue(new Error('LLM down'));

        const res = await (POST as unknown as Handler)(
            makeReq({ question: 'cek stok' }),
        );
        const events = (await collectEvents(res.body!)) as Array<{
            type: string;
            message?: string;
        }>;

        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('error');
        expect(events[0].message).toContain('kendala');
        // Kegagalan tetap tercatat sebagai audit.
        expect(logMock).toHaveBeenCalledTimes(1);
        expect(logMock.mock.calls[0][0].success).toBe(false);
    });
});
