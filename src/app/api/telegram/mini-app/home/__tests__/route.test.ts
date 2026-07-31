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

vi.mock('@/lib/core/prisma', () => ({
  getTenantIdFromContext: vi.fn(() => 'tenant-melindo'),
  prisma: {
    user: {
      findUnique: vi.fn().mockResolvedValue({ isActive: true }),
    },
    productionOrder: {
      count: vi.fn().mockResolvedValue(0),
    },
    salesOrder: {
      count: vi.fn().mockResolvedValue(0),
    },
    invoice: {
      count: vi.fn().mockResolvedValue(0),
    },
    purchaseOrder: {
      count: vi.fn().mockResolvedValue(0),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ count: BigInt(0) }]),
  },
}));

vi.mock('@/lib/telegram/kill-switch', () => ({
  isMiniAppEnabled: vi.fn(() => true),
}));

vi.mock('@/lib/telegram/session', () => ({
  extractSessionTokenFromCookieHeader: vi.fn(),
  verifyTelegramSession: vi.fn(),
}));

vi.mock('@/lib/telegram/audit', () => ({
  logTelegramAudit: vi.fn(),
}));

vi.mock('@/lib/telegram/identity-service', () => ({
  findIdentityByTelegramUserId: vi.fn(),
}));

function assertResponse(res: void | Response): Response {
  if (res && typeof res === 'object' && 'status' in res && typeof (res as Response).json === 'function') {
    return res as Response;
  }
  throw new Error(`Expected Response but got ${String(res)}`);
}

function makeRequest(headers: Record<string, string> = {}) {
  return {
    headers: {
      get: (key: string) => headers[key.toLowerCase()] ?? headers[key] ?? null,
    },
  } as unknown as Parameters<typeof import('../route').GET>[0];
}

describe('Telegram mini-app home route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when there is no session cookie', async () => {
    const { extractSessionTokenFromCookieHeader } = await import('@/lib/telegram/session');
    (extractSessionTokenFromCookieHeader as ReturnType<typeof vi.fn>).mockReturnValue(null);

    const { GET } = await import('../route');
    const res = assertResponse(await GET(makeRequest()));

    expect(res.status).toBe(401);
  });

  it('returns 401 when the session token is invalid', async () => {
    const { extractSessionTokenFromCookieHeader, verifyTelegramSession } = await import('@/lib/telegram/session');
    (extractSessionTokenFromCookieHeader as ReturnType<typeof vi.fn>).mockReturnValue('raw-token');
    (verifyTelegramSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      valid: false,
      reason: 'not found',
    });

    const { GET } = await import('../route');
    const res = assertResponse(await GET(makeRequest({ cookie: 'polyflow_tg=raw-token' })));

    expect(res.status).toBe(401);
  });

  it('returns 403 REVOKED when the identity is revoked', async () => {
    const { extractSessionTokenFromCookieHeader, verifyTelegramSession } = await import('@/lib/telegram/session');
    (extractSessionTokenFromCookieHeader as ReturnType<typeof vi.fn>).mockReturnValue('raw-token');
    (verifyTelegramSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      valid: true,
      session: { telegramUserId: '123', tenantId: 'tenant-melindo', userId: 'user-1' },
    });
    const { findIdentityByTelegramUserId } = await import('@/lib/telegram/identity-service');
    (findIdentityByTelegramUserId as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'identity-1',
      status: 'REVOKED',
    });

    const { GET } = await import('../route');
    const res = assertResponse(await GET(makeRequest({ cookie: 'polyflow_tg=raw-token' })));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.status).toBe('REVOKED');
  });

  it('returns 403 REVOKED when identity does not exist', async () => {
    const { extractSessionTokenFromCookieHeader, verifyTelegramSession } = await import('@/lib/telegram/session');
    (extractSessionTokenFromCookieHeader as ReturnType<typeof vi.fn>).mockReturnValue('raw-token');
    (verifyTelegramSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      valid: true,
      session: { telegramUserId: '123', tenantId: 'tenant-melindo', userId: 'user-1' },
    });
    const { findIdentityByTelegramUserId } = await import('@/lib/telegram/identity-service');
    (findIdentityByTelegramUserId as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { GET } = await import('../route');
    const res = assertResponse(await GET(makeRequest({ cookie: 'polyflow_tg=raw-token' })));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.status).toBe('REVOKED');
  });

  it('returns 403 USER_INACTIVE when the user is inactive', async () => {
    const { extractSessionTokenFromCookieHeader, verifyTelegramSession } = await import('@/lib/telegram/session');
    (extractSessionTokenFromCookieHeader as ReturnType<typeof vi.fn>).mockReturnValue('raw-token');
    (verifyTelegramSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      valid: true,
      session: { telegramUserId: '123', tenantId: 'tenant-melindo', userId: 'user-1' },
    });
    const { findIdentityByTelegramUserId } = await import('@/lib/telegram/identity-service');
    (findIdentityByTelegramUserId as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'identity-1',
      status: 'ACTIVE',
    });
    const { prisma } = await import('@/lib/core/prisma');
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      isActive: false,
    });

    const { GET } = await import('../route');
    const res = assertResponse(await GET(makeRequest({ cookie: 'polyflow_tg=raw-token' })));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.status).toBe('USER_INACTIVE');
  });

  it('returns 403 USER_INACTIVE when user does not exist', async () => {
    const { extractSessionTokenFromCookieHeader, verifyTelegramSession } = await import('@/lib/telegram/session');
    (extractSessionTokenFromCookieHeader as ReturnType<typeof vi.fn>).mockReturnValue('raw-token');
    (verifyTelegramSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      valid: true,
      session: { telegramUserId: '123', tenantId: 'tenant-melindo', userId: 'user-1' },
    });
    const { findIdentityByTelegramUserId } = await import('@/lib/telegram/identity-service');
    (findIdentityByTelegramUserId as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'identity-1',
      status: 'ACTIVE',
    });
    const { prisma } = await import('@/lib/core/prisma');
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const { GET } = await import('../route');
    const res = assertResponse(await GET(makeRequest({ cookie: 'polyflow_tg=raw-token' })));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.status).toBe('USER_INACTIVE');
  });

  it('returns 200 with kpis array on happy path', async () => {
    const { extractSessionTokenFromCookieHeader, verifyTelegramSession } = await import('@/lib/telegram/session');
    (extractSessionTokenFromCookieHeader as ReturnType<typeof vi.fn>).mockReturnValue('raw-token');
    (verifyTelegramSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      valid: true,
      session: { telegramUserId: '123', tenantId: 'tenant-melindo', userId: 'user-1' },
    });
    const { findIdentityByTelegramUserId } = await import('@/lib/telegram/identity-service');
    (findIdentityByTelegramUserId as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'identity-1',
      status: 'ACTIVE',
    });
    const { prisma } = await import('@/lib/core/prisma');
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ isActive: true });

    const { GET } = await import('../route');
    const res = assertResponse(await GET(makeRequest({ cookie: 'polyflow_tg=raw-token' })));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(body.kpis)).toBe(true);
  });
});
