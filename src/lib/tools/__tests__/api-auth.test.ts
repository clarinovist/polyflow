import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => {
  class MockNextResponse {
    status: number;
    _body: unknown;
    constructor(body?: unknown, init?: { status?: number }) {
      this._body = body;
      this.status = init?.status || 200;
    }
    async text() { return String(this._body); }
    async json() { return typeof this._body === 'string' ? JSON.parse(this._body) : this._body; }
    static json(body: unknown, init?: { status?: number }) {
      return new MockNextResponse(body, init);
    }
  }
  return { NextResponse: MockNextResponse, NextRequest: class {} };
});

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  userRole: { findMany: vi.fn() },
}));

const mockTenantDb = vi.hoisted(() => ({ user: { findUnique: vi.fn() } }));
const mockResolveTenantContext = vi.hoisted(() => vi.fn());
vi.mock('@/lib/core/tenant', () => ({ resolveTenantContext: mockResolveTenantContext }));
vi.mock('@/lib/core/prisma', () => ({
  prisma: mockPrisma,
  getMainPrisma: () => mockPrisma,
}));

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

import { requireApiAuth, requireApiRoles } from '../api-auth';
import { auth } from '@/auth';

describe('requireApiAuth upload contract', () => {
  const request = new Request('https://example.test/api/upload', {
    headers: { 'x-tenant-subdomain': 'fixture' },
  });

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1', role: 'SALES' } } as never);
    mockResolveTenantContext.mockResolvedValue({
      type: 'RESOLVED', tenantDb: mockTenantDb,
    });
    mockTenantDb.user.findUnique.mockResolvedValue({ id: 'u1' });
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', role: 'ADMIN' });
  });

  it.each([null, { user: {} }])('returns stable 401 for missing session/id %j without DB access', async (session) => {
    vi.mocked(auth).mockResolvedValue(session as never);
    const result = await requireApiAuth(request, ['SALES']);
    expect(result.response?.status).toBe(401);
    expect(await result.response?.json()).toEqual({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    expect(result.userId).toBe('');
    expect(mockResolveTenantContext).not.toHaveBeenCalled();
    expect(mockTenantDb.user.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('returns stable 401 for stale tenant user even when the main DB has that ID', async () => {
    mockTenantDb.user.findUnique.mockResolvedValue(null);
    const result = await requireApiAuth(request, ['SALES']);
    expect(result.response?.status).toBe(401);
    expect(await result.response?.json()).toEqual({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    expect(result.userId).toBe('');
    expect(mockResolveTenantContext).toHaveBeenCalledWith(request.headers);
    expect(mockTenantDb.user.findUnique).toHaveBeenCalledWith({ where: { id: 'u1' }, select: { id: true } });
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('returns stable 403 for disallowed roles', async () => {
    const result = await requireApiAuth(request, ['PROCUREMENT']);
    expect(result.response?.status).toBe(403);
    expect(await result.response?.json()).toEqual({ error: 'Forbidden', code: 'FORBIDDEN' });
    expect(result.userId).toBe('');
  });

  it.each([
    { role: 'SALES' },
    { role: 'PRODUCTION', roles: ['MARKETING'] },
    { role: 'ADMIN' },
  ])('preserves primary, assigned and admin role access: %j', async (roles) => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1', ...roles } } as never);
    expect(await requireApiAuth(request, ['SALES', 'MARKETING'])).toEqual({ response: null, userId: 'u1' });
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('allows authenticated warehouse uploads without a role restriction', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never);
    expect(await requireApiAuth(request)).toEqual({ response: null, userId: 'u1' });
  });

  it('uses main DB only for a non-tenant request', async () => {
    mockResolveTenantContext.mockResolvedValue({ type: 'NONE' });
    expect(await requireApiAuth(request)).toEqual({ response: null, userId: 'u1' });
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'u1' }, select: { id: true } });
    expect(mockTenantDb.user.findUnique).not.toHaveBeenCalled();
  });

  it('returns 401 for stale main DB user', async () => {
    mockResolveTenantContext.mockResolvedValue({ type: 'NONE' });
    mockPrisma.user.findUnique.mockResolvedValue(null);
    expect((await requireApiAuth(request)).response?.status).toBe(401);
  });

  it('fails closed for unknown tenant without falling back to main DB', async () => {
    mockResolveTenantContext.mockResolvedValue({ type: 'NOT_FOUND', subdomain: 'fixture' });
    const result = await requireApiAuth(request);
    expect(result.response?.status).toBe(403);
    expect(await result.response?.json()).toEqual({ error: 'Forbidden', code: 'TENANT_NOT_FOUND' });
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    expect(mockTenantDb.user.findUnique).not.toHaveBeenCalled();
  });

  it('does not disguise infrastructure errors as auth denial', async () => {
    mockTenantDb.user.findUnique.mockRejectedValue(new Error('DB unavailable'));
    await expect(requireApiAuth(request)).rejects.toThrow('DB unavailable');
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });
});

describe('requireApiRoles (G6)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no session', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const result = await requireApiRoles(['ADMIN']);
    expect(result.response).not.toBeNull();
    expect(result.response!.status).toBe(401);
  });

  it('returns 401 when session has no user id', async () => {
    vi.mocked(auth).mockResolvedValue({ user: {} } as never);
    const result = await requireApiRoles(['ADMIN']);
    expect(result.response).not.toBeNull();
    expect(result.response!.status).toBe(401);
  });

  it('returns 403 when role not allowed', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never);
    mockPrisma.user.findUnique.mockResolvedValue({ role: 'SALES' });
    mockPrisma.userRole.findMany.mockResolvedValue([]);
    const result = await requireApiRoles(['ADMIN', 'PLANNING']);
    expect(result.response).not.toBeNull();
    expect(result.response!.status).toBe(403);
  });

  it('returns null when role is allowed via User.role', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never);
    mockPrisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
    mockPrisma.userRole.findMany.mockResolvedValue([]);
    const result = await requireApiRoles(['ADMIN', 'PLANNING']);
    expect(result.response).toBeNull();
  });

  it('returns null when role is allowed via UserRole table', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never);
    mockPrisma.user.findUnique.mockResolvedValue({ role: 'SALES' });
    mockPrisma.userRole.findMany.mockResolvedValue([{ role: 'WAREHOUSE' }]);
    const result = await requireApiRoles(['WAREHOUSE']);
    expect(result.response).toBeNull();
  });

  it('returns null when allowed via multiple roles combined', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never);
    mockPrisma.user.findUnique.mockResolvedValue({ role: 'PRODUCTION' });
    mockPrisma.userRole.findMany.mockResolvedValue([{ role: 'PLANNING' }]);
    const result = await requireApiRoles(['ADMIN', 'PLANNING']);
    expect(result.response).toBeNull();
  });
});
