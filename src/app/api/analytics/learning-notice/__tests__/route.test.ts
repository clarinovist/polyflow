import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), resolve: vi.fn() }));
vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/core/tenant', () => ({ resolveTenantContext: mocks.resolve }));
import { GET } from '../route';
beforeEach(() => {
    vi.resetAllMocks(); vi.unstubAllEnvs();
    for (const [key, value] of Object.entries({ OWNER_LEARNING_ENABLED: 'true', OWNER_LEARNING_USER_ID: 'private-owner', OWNER_LEARNING_TENANT_IDS: 'a,b', OWNER_LEARNING_POLICY_VERSION: 'v1-test', OWNER_LEARNING_ACTIVE_FROM: '2026-10-18T00:00:00Z', OWNER_LEARNING_SCOPE: 'private-owner-usage-commerce' })) vi.stubEnv(key, value);
});
describe('learning transparency notice', () => {
    it('reveals only active/version to an authenticated in-scope tenant', async () => {
        mocks.auth.mockResolvedValue({ user: { id: 'u' } }); mocks.resolve.mockResolvedValue({ type: 'RESOLVED', tenantId: 'a' });
        const response = await GET(new Request('https://example.invalid'));
        expect(await response.json()).toEqual({ active: true, version: 'v1-test' });
        expect(response.headers.get('cache-control')).toBe('private, no-store');
    });
    it('does not reveal scope to unauthenticated or other tenants', async () => {
        mocks.auth.mockResolvedValue(null); expect((await GET(new Request('https://example.invalid'))).status).toBe(401);
        mocks.auth.mockResolvedValue({ user: { id: 'u' } }); mocks.resolve.mockResolvedValue({ type: 'RESOLVED', tenantId: 'other' });
        expect(await (await GET(new Request('https://example.invalid'))).json()).toEqual({ active: false });
        vi.stubEnv('OWNER_LEARNING_ENABLED', 'false');
        expect(await (await GET(new Request('https://example.invalid'))).json()).toEqual({ active: false });
    });
});
