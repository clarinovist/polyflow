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

vi.mock('@/lib/core/prisma', () => ({ prisma: mockPrisma }));

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

import { requireApiRoles } from '../api-auth';
import { auth } from '@/auth';

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
