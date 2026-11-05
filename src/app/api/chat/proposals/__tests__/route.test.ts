import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ValidationError } from '@/lib/errors/errors';

const auth = vi.fn();
const verify = vi.fn();
const list = vi.fn();
const confirm = vi.fn();
const cancel = vi.fn();
let tenant: string | undefined = 'tenant-1';

vi.mock('next/server', () => ({
    NextResponse: {
        json: (body: unknown, init?: ResponseInit) =>
            new Response(JSON.stringify(body), init),
    },
}));
vi.mock('@/auth', () => ({ auth: () => auth() }));
vi.mock('@/lib/core/tenant', () => ({ withTenantRoute: (h: unknown) => h }));
vi.mock('@/lib/core/prisma', () => ({ getTenantIdFromContext: () => tenant }));
vi.mock('@/lib/bot/assistant-session', () => ({
    verifyAssistantSessionUser: (...a: unknown[]) => verify(...a),
}));
vi.mock('@/services/assistant/action-proposal-service', () => ({
    listPendingProposals: (...a: unknown[]) => list(...a),
    confirmProposal: (...a: unknown[]) => confirm(...a),
    cancelProposal: (...a: unknown[]) => cancel(...a),
}));
vi.mock('@/services/assistant/invoice-access', () => ({
    buildInvoiceAccessGuard: vi.fn(() => vi.fn()),
}));

import { GET, POST } from '../route';

type Handler = (req: unknown) => Promise<Response>;
const get = () => (GET as unknown as Handler)({});
function post(body: unknown, headers: Record<string, string> = {}) {
    const all = new Map(
        Object.entries({
            'content-type': 'application/json',
            host: 'app.test',
            ...headers,
        }),
    );
    return (POST as unknown as Handler)({
        headers: { get: (k: string) => all.get(k.toLowerCase()) ?? null },
        json: async () => body,
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    tenant = 'tenant-1';
    auth.mockResolvedValue({ user: { id: 'user-1' } });
    verify.mockResolvedValue({
        id: 'user-1',
        role: 'SALES',
        roles: ['SALES'],
        allowedResources: ['/sales/collection'],
    });
    list.mockResolvedValue([]);
    confirm.mockResolvedValue({ proposalId: 'p1', resultRef: 'ca1' });
    cancel.mockResolvedValue(true);
});

describe('GET /api/chat/proposals', () => {
    it('lists only for the DB-verified caller and disables caches', async () => {
        const res = await get();
        expect(res.status).toBe(200);
        expect(res.headers.get('cache-control')).toBe('private, no-store');
        expect(list).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            userId: 'user-1',
        });
    });

    it('rejects unauthenticated, tenantless and revoked callers', async () => {
        auth.mockResolvedValue(null);
        expect((await get()).status).toBe(401);
        auth.mockResolvedValue({ user: { id: 'user-1' } });
        tenant = undefined;
        expect((await get()).status).toBe(403);
        tenant = 'tenant-1';
        verify.mockResolvedValue(null);
        expect((await get()).status).toBe(403);
        expect(list).not.toHaveBeenCalled();
    });
});

describe('POST /api/chat/proposals', () => {
    it('confirms with the verified identity, ignoring any identity in the body', async () => {
        const res = await post({
            proposalId: 'p1',
            action: 'confirm',
        });
        expect(res.status).toBe(200);
        expect(confirm).toHaveBeenCalledWith(
            expect.objectContaining({
                proposalId: 'p1',
                tenantId: 'tenant-1',
                userId: 'user-1',
            }),
        );
    });

    it('rejects extra body keys such as a forged userId', async () => {
        const res = await post({
            proposalId: 'p1',
            action: 'confirm',
            userId: 'evil',
        });
        expect(res.status).toBe(400);
        expect(confirm).not.toHaveBeenCalled();
    });

    it('rejects a cross-origin request and non-JSON content', async () => {
        expect(
            (
                await post(
                    { proposalId: 'p1', action: 'confirm' },
                    { origin: 'https://evil.test' },
                )
            ).status,
        ).toBe(403);
        expect(
            (
                await post(
                    { proposalId: 'p1', action: 'confirm' },
                    { 'content-type': 'text/plain' },
                )
            ).status,
        ).toBe(415);
        expect(confirm).not.toHaveBeenCalled();
    });

    it('denies confirm when live permissions lost the collection resource', async () => {
        verify.mockResolvedValue({
            id: 'user-1',
            role: 'SALES',
            roles: ['SALES'],
            allowedResources: ['/warehouse/inventory'],
        });
        const res = await post({ proposalId: 'p1', action: 'confirm' });
        expect(res.status).toBe(403);
        expect(confirm).not.toHaveBeenCalled();
    });

    it('hides internal status codes when a proposal is no longer confirmable', async () => {
        confirm.mockRejectedValue(
            new ValidationError('PROPOSAL_NOT_CONFIRMABLE:CONFIRMED'),
        );
        const res = await post({ proposalId: 'p1', action: 'confirm' });
        expect(res.status).toBe(409);
        const text = JSON.stringify(await res.json());
        expect(text).not.toContain('PROPOSAL_NOT_CONFIRMABLE');
    });

    it('cancels through the owner-scoped service and 409s when nothing changed', async () => {
        expect(
            (await post({ proposalId: 'p1', action: 'cancel' })).status,
        ).toBe(200);
        cancel.mockResolvedValue(false);
        expect(
            (await post({ proposalId: 'p1', action: 'cancel' })).status,
        ).toBe(409);
    });

    it('does not expose unexpected errors', async () => {
        confirm.mockRejectedValue(new Error('private connection details'));
        const res = await post({ proposalId: 'p1', action: 'confirm' });
        expect(res.status).toBe(500);
        expect(JSON.stringify(await res.json())).not.toContain('private');
    });
});
