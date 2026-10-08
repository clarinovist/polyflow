import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), query: vi.fn() }));
vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/core/prisma', () => ({ prisma: { $queryRaw: mocks.query } }));
describe('super-admin diagnostics route', () => {
  beforeEach(() => { vi.resetModules(); mocks.auth.mockReset(); mocks.query.mockReset().mockResolvedValue([{ value: 1 }]); });
  it.each([null, { user: { role: 'ADMIN', isSuperAdmin: false } }])('rejects non-super-admin callers', async (session) => {
    mocks.auth.mockResolvedValue(session); const { GET } = await import('../route'); const response = await GET();
    expect(response).toEqual({ data: { error: 'Forbidden' }, init: { status: 403 } });
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it('returns a degraded safe envelope when the host snapshot is unavailable', async () => {
    mocks.auth.mockResolvedValue({ user: { isSuperAdmin: true } });
    vi.stubEnv('OPERATIONS_SNAPSHOT_PATH', '/definitely/missing/operations.json');
    const { GET } = await import('../route'); const response = await GET() as unknown as { data: Record<string, unknown> };
    expect(response.data.status).toBe('DEGRADED');
    expect(response.data.operations).toEqual({ available: false, stale: true, data: null });
    expect(JSON.stringify(response.data)).not.toContain('DATABASE_URL'); vi.unstubAllEnvs();
  });
});
