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
  it('accepts only a validated, current, sanitized host snapshot', async () => {
    mocks.auth.mockResolvedValue({ user: { isSuperAdmin: true } });
    const { mkdtemp, writeFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const directory = await mkdtemp(join(tmpdir(), 'operations-snapshot-'));
    const snapshotPath = join(directory, 'health.json');
    await writeFile(snapshotPath, JSON.stringify({
      generatedAt: new Date().toISOString(), status: 'healthy', releaseSha: 'a'.repeat(12),
      services: { web: 'healthy', worker: 'healthy', database: 'healthy' },
      backup: { status: 'healthy', databaseCount: 3, latestAgeSeconds: 60, assistantSources: 0, lastJob: 'success' },
      disk: { usedPercent: 44, level: 'normal' },
      recovery: { rpoHours: 24, rtoHours: 2, lastRestoreDrill: { status: 'passed', durationSeconds: 111, databaseCount: 3 } },
    }));
    vi.stubEnv('OPERATIONS_SNAPSHOT_PATH', snapshotPath);
    const { GET } = await import('../route'); const response = await GET() as unknown as { data: Record<string, unknown> };
    expect(response.data.status).toBe('OK');
    expect(response.data.operations).toMatchObject({ available: true, stale: false });
    vi.unstubAllEnvs();
  });
});
