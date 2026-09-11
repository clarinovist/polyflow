import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    withTenantRoute: (handler: (request: unknown) => unknown) => handler,
}));
vi.mock('@/lib/core/prisma', () => ({
    getTenantIdFromContext: () => 'tenant-1',
}));

const auth = vi.fn();
const verify = vi.fn();
const generate = vi.fn();
const audit = vi.fn();
const bugNotice = vi.fn();
vi.mock('@/lib/bot/bug-report', () => ({ assistantBugReportNotice: (...args: unknown[]) => bugNotice(...args) }));

vi.mock('@/auth', () => ({ auth: () => auth() }));
vi.mock('@/lib/bot/assistant-session', () => ({
    verifyAssistantSessionUser: (...args: unknown[]) => verify(...args),
}));
vi.mock('@/lib/bot/virtual-cs-service', () => ({
    generateVirtualCsReply: (...args: unknown[]) => generate(...args),
}));
vi.mock('@/lib/bot/chat-audit', () => ({
    logVirtualCsEvent: (...args: unknown[]) => audit(...args),
}));
vi.mock('@/lib/bot/product-scope', () => ({ POLYFLOW_PRODUCT_ID: 'polyflow' }));

import { POST } from '../route';
import { __resetChatRateLimit } from '@/lib/bot/chat-rate-limit';

function request(body: unknown) {
    return { json: async () => body };
}

type ResponseLike = {
    status: number;
    json: () => Promise<Record<string, unknown>>;
};

describe('POST /api/chat', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        __resetChatRateLimit();
        auth.mockResolvedValue({ user: { id: 'user-1', name: 'User' } });
        verify.mockResolvedValue({
            id: 'user-1',
            name: 'User',
            role: 'FINANCE',
            roles: ['FINANCE'],
            isSuperAdmin: false,
            allowedResources: ['/finance'],
        });
        generate.mockResolvedValue({
            answer: 'ok',
            citations: [],
            safety: { allowed: true },
        });
        audit.mockResolvedValue('interaction-1');
        bugNotice.mockResolvedValue(undefined);
    });

    it('forwards validated context and current DB permissions', async () => {
        const response = (await (POST as unknown as (
            req: unknown,
        ) => Promise<ResponseLike>)(
            request({
                question: 'cek invoice ini',
                workContext: { pathname: '/finance/invoices/sales/inv-1' },
            }),
        )) as ResponseLike;

        expect(response.status).toBe(200);
        expect(generate).toHaveBeenCalledWith(
            expect.objectContaining({ question: 'cek invoice ini' }),
            expect.objectContaining({
                tenantId: 'tenant-1',
                permissionsVerified: true,
                workContext: {
                    pathname: '/finance/invoices/sales/inv-1',
                },
                sessionUser: expect.objectContaining({
                    allowedResources: ['/finance'],
                }),
            }),
        );
    });

    it('forwards server-derived disposition to outcome audit', async () => {
        generate.mockResolvedValueOnce({
            answer: 'Mohon kirim detail reproduksi.',
            citations: [],
            disposition: 'NEEDS_CLARIFICATION',
            safety: { allowed: true },
        });
        await (POST as unknown as (
            req: unknown,
        ) => Promise<ResponseLike>)(request({ question: 'nilai berubah' }));

        expect(audit).toHaveBeenCalledWith(
            expect.objectContaining({ disposition: 'NEEDS_CLARIFICATION' }),
        );
    });

    it('passes only persisted server response and verified identity to the reporter after audit', async () => {
        const result = { answer: 'Dugaan bug', citations: [], disposition: 'ESCALATE', conversationId: 'authorized', historySaved: true, safety: { allowed: true } };
        generate.mockResolvedValueOnce(result);
        bugNotice.mockResolvedValueOnce('Telegram belum tersedia.');
        const response = await (POST as unknown as (req: unknown) => Promise<ResponseLike>)(request({ question: 'error input', tenantId: 'forged', userId: 'forged', disposition: 'ESCALATE' }));
        expect(bugNotice).toHaveBeenCalledWith(result, 'interaction-1', { tenantId: 'tenant-1', userId: 'user-1' });
        expect(audit.mock.invocationCallOrder[0]).toBeLessThan(bugNotice.mock.invocationCallOrder[0]);
        expect((await response.json()).data).toMatchObject({ bugReportNotice: 'Telegram belum tersedia.' });
    });
    it('fails closed when the session user cannot be verified in tenant DB', async () => {
        verify.mockResolvedValue(null);
        const response = await (POST as unknown as (
            req: unknown,
        ) => Promise<ResponseLike>)(request({ question: 'cek invoice' }));
        expect(response.status).toBe(403);
        expect(generate).not.toHaveBeenCalled();
        expect(bugNotice).not.toHaveBeenCalled();
    });

    it('rejects malformed work context', async () => {
        const response = await (POST as unknown as (
            req: unknown,
        ) => Promise<ResponseLike>)(
            request({
                question: 'cek invoice',
                workContext: { pathname: 1 },
            }),
        );
        expect(response.status).toBe(400);
        expect(verify).not.toHaveBeenCalled();
    });
});
