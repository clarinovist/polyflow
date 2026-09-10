import { beforeEach, describe, expect, it, vi } from 'vitest';
const auth = vi.fn();
const verify = vi.fn();
const query = vi.fn();
let tenant: string | undefined = 'tenant-1';
vi.mock('next/server', () => ({ NextResponse: { json: (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init) } }));
vi.mock('@/auth', () => ({ auth: () => auth() }));
vi.mock('@/lib/core/tenant', () => ({ withTenantRoute: (handler: unknown) => handler }));
vi.mock('@/lib/core/prisma', () => ({ getTenantIdFromContext: () => tenant }));
vi.mock('@/lib/bot/assistant-session', () => ({ verifyAssistantSessionUser: (...args: unknown[]) => verify(...args) }));
vi.mock('@/lib/bot/conversation-history', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/bot/conversation-history')>(), queryConversationHistory: (...args: unknown[]) => query(...args) }));
import { GET } from '../route';
const get = (search = '') => (GET as unknown as (req: unknown) => Promise<Response>)({ nextUrl: new URL(`http://localhost/api/chat/history${search}`) });

beforeEach(() => {
    vi.clearAllMocks(); tenant = 'tenant-1';
    auth.mockResolvedValue({ user: { id: 'user-1', allowedResources: ['STALE'] } });
    verify.mockResolvedValue({ id: 'user-1', roles: ['FINANCE'], allowedResources: ['/finance'] });
    query.mockResolvedValue({ conversations: [], nextOffset: null });
});

describe('GET /api/chat/history', () => {
    it('uses DB-verified authority, ignores forged identity and disables caches', async () => {
        const response = await get('?tenantId=evil&userId=evil&allowedResources=ALL');
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        expect(query.mock.calls[0][0]).toMatchObject({ tenantId: 'tenant-1', userId: 'user-1', allowedResources: ['/finance'] });
    });
    it('rejects unauthenticated sessions', async () => {
        auth.mockResolvedValue(null); expect((await get()).status).toBe(401); expect(query).not.toHaveBeenCalled();
    });
    it('rejects missing tenant, inactive/revoked user and does not run history query', async () => {
        tenant = undefined; expect((await get()).status).toBe(403);
        tenant = 'tenant-1'; verify.mockResolvedValue(null); expect((await get()).status).toBe(403);
        expect(query).not.toHaveBeenCalled();
    });
    it('validates mode, ID and bounded pagination', async () => {
        for (const search of ['?mode=delete', '?mode=detail', '?offset=-1', '?offset=100001']) expect((await get(search)).status).toBe(400);
        expect(query).not.toHaveBeenCalled();
    });
    it('uses generic not found for a non-owned/missing/inaccessible thread', async () => {
        query.mockResolvedValue({ conversation: null });
        expect((await get('?mode=detail&conversationId=foreign')).status).toBe(404);
        expect((await get('?mode=latest')).status).toBe(200);
    });
    it('does not expose database errors', async () => {
        query.mockRejectedValue(new Error('private connection details'));
        const response = await get(); expect(response.status).toBe(500);
        expect(JSON.stringify(await response.json())).not.toContain('private connection');
    });
});
