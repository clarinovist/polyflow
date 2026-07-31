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
      findUnique: vi.fn().mockResolvedValue({
        id: 'user-1',
        name: 'Budi',
        role: 'ADMIN',
        isSuperAdmin: false,
        isActive: true,
      }),
    },
    userRole: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    rolePermission: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock('@/lib/api/rate-limit', () => ({
  rateLimit: vi.fn(() => ({ success: true, count: 1, remaining: 19 })),
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

vi.mock('@/lib/bot/virtual-cs-service', () => ({
  generateVirtualCsReply: vi.fn().mockResolvedValue({
    answer: 'Jawaban test',
    safety: { allowed: true },
    retrievedContext: [],
  }),
}));

vi.mock('@/lib/bot/chat-audit', () => ({
  logVirtualCsEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/bot/product-scope', () => ({
  POLYFLOW_PRODUCT_ID: 'polyflow',
}));

vi.mock('@/lib/bot/assistant-context', () => ({
  buildAssistantContext: vi.fn(() => ({ channel: 'telegram_mini_app', role: 'assistant' })),
}));

function assertResponse(res: void | Response): Response {
  if (res && typeof res === 'object' && 'status' in res && typeof (res as Response).json === 'function') {
    return res as Response;
  }
  throw new Error(`Expected Response but got ${String(res)}`);
}

function makeRequest(
  body: unknown = { question: 'Apa stok hari ini?' },
  headers: Record<string, string> = {},
) {
  return {
    headers: {
      get: (key: string) => headers[key.toLowerCase()] ?? headers[key] ?? null,
    },
    json: async () => body,
  } as unknown as Parameters<typeof import('../route').POST>[0];
}

describe('Telegram mini-app query route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when there is no session cookie', async () => {
    const { extractSessionTokenFromCookieHeader } = await import('@/lib/telegram/session');
    (extractSessionTokenFromCookieHeader as ReturnType<typeof vi.fn>).mockReturnValue(null);

    const { POST } = await import('../route');
    const res = assertResponse(await POST(makeRequest()));

    expect(res.status).toBe(401);
  });

  it('returns 401 when the session token is invalid', async () => {
    const { extractSessionTokenFromCookieHeader, verifyTelegramSession } = await import('@/lib/telegram/session');
    (extractSessionTokenFromCookieHeader as ReturnType<typeof vi.fn>).mockReturnValue('raw-token');
    (verifyTelegramSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      valid: false,
      reason: 'not found',
    });

    const { POST } = await import('../route');
    const res = assertResponse(await POST(makeRequest(undefined, { cookie: 'polyflow_tg=raw-token' })));

    expect(res.status).toBe(401);
  });

  it('returns 429 when rate limit is hit', async () => {
    const { extractSessionTokenFromCookieHeader, verifyTelegramSession } = await import('@/lib/telegram/session');
    (extractSessionTokenFromCookieHeader as ReturnType<typeof vi.fn>).mockReturnValue('raw-token');
    (verifyTelegramSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      valid: true,
      session: { telegramUserId: '123', tenantId: 'tenant-melindo', userId: 'user-1' },
    });
    const { rateLimit } = await import('@/lib/api/rate-limit');
    (rateLimit as ReturnType<typeof vi.fn>).mockReturnValueOnce({ success: false, count: 21, remaining: 0 });

    const { POST } = await import('../route');
    const res = assertResponse(await POST(makeRequest(undefined, { cookie: 'polyflow_tg=raw-token' })));

    expect(res.status).toBe(429);
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

    const { POST } = await import('../route');
    const res = assertResponse(await POST(makeRequest(undefined, { cookie: 'polyflow_tg=raw-token' })));
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

    const { POST } = await import('../route');
    const res = assertResponse(await POST(makeRequest(undefined, { cookie: 'polyflow_tg=raw-token' })));
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
      id: 'user-1',
      name: 'Budi',
      role: 'ADMIN',
      isSuperAdmin: false,
      isActive: false,
    });

    const { POST } = await import('../route');
    const res = assertResponse(await POST(makeRequest(undefined, { cookie: 'polyflow_tg=raw-token' })));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.status).toBe('USER_INACTIVE');
  });

  it('returns 200 success:true on happy path', async () => {
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
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'user-1',
      name: 'Budi',
      role: 'ADMIN',
      isSuperAdmin: false,
      isActive: true,
    });

    const { POST } = await import('../route');
    const res = assertResponse(await POST(makeRequest(undefined, { cookie: 'polyflow_tg=raw-token' })));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });
});
