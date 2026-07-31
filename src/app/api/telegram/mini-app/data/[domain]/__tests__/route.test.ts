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
  withTenantRoute: (handler: (req: unknown, ctx: unknown) => unknown) => handler,
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
    userRole: { findMany: vi.fn().mockResolvedValue([]) },
    rolePermission: { findMany: vi.fn().mockResolvedValue([]) },
    salesOrder: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    productionOrder: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    invoice: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    purchaseOrder: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@/lib/api/rate-limit', () => ({
  rateLimit: vi.fn(() => ({ success: true, count: 1, remaining: 29 })),
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

vi.mock('@/lib/telegram/domain-access', async (orig) => {
  const actual = await orig();
  return actual;
});

function assertResponse(res: void | Response): Response {
  if (res && typeof res === 'object' && 'status' in res && typeof (res as Response).json === 'function') {
    return res as Response;
  }
  throw new Error(`Expected Response but got ${String(res)}`);
}

function makeRequest(domain: string, query: Record<string, string> = {}, headers: Record<string, string> = {}) {
  const qs = new URLSearchParams(query).toString();
  const url = `http://localhost/api/telegram/mini-app/data/${domain}${qs ? `?${qs}` : ''}`;
  return {
    url,
    headers: {
      get: (key: string) => headers[key.toLowerCase()] ?? headers[key] ?? null,
    },
  } as unknown as Parameters<typeof import('../route').GET>[0];
}

function domainParams(domain: string) {
  return { params: Promise.resolve({ domain }) } as unknown as { params: Promise<Record<string, string | string[]>> };
}

function setupSession() {
  const session = {
    extractSessionTokenFromCookieHeader: null as unknown,
    verifyTelegramSession: null as unknown,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const sess = await import('@/lib/telegram/session');
    session.extractSessionTokenFromCookieHeader = sess.extractSessionTokenFromCookieHeader;
    session.verifyTelegramSession = sess.verifyTelegramSession;

    (session.extractSessionTokenFromCookieHeader as ReturnType<typeof vi.fn>).mockReturnValue('raw-token');
    (session.verifyTelegramSession as ReturnType<typeof vi.fn>).mockResolvedValue({
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
  });

  return session;
}

describe('Telegram mini-app data/[domain] route', () => {
  const session = setupSession();

  it('returns 401 when there is no session cookie', async () => {
    (session.extractSessionTokenFromCookieHeader as ReturnType<typeof vi.fn>).mockReturnValue(null);

    const { GET } = await import('../route');
    const res = assertResponse(await GET(makeRequest('stock'), domainParams('stock')));

    expect(res.status).toBe(401);
  });

  it('returns 401 when the session token is invalid', async () => {
    (session.verifyTelegramSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      valid: false,
      reason: 'not found',
    });

    const { GET } = await import('../route');
    const res = assertResponse(
      await GET(makeRequest('stock', {}, { cookie: 'polyflow_tg=raw-token' }), domainParams('stock')),
    );

    expect(res.status).toBe(401);
  });

  it('returns 429 when rate limit is hit', async () => {
    const { rateLimit } = await import('@/lib/api/rate-limit');
    (rateLimit as ReturnType<typeof vi.fn>).mockReturnValueOnce({ success: false, count: 31, remaining: 0 });

    const { GET } = await import('../route');
    const res = assertResponse(
      await GET(makeRequest('stock', {}, { cookie: 'polyflow_tg=raw-token' }), domainParams('stock')),
    );

    expect(res.status).toBe(429);
  });

  it('returns 403 REVOKED when the identity is revoked', async () => {
    const { findIdentityByTelegramUserId } = await import('@/lib/telegram/identity-service');
    (findIdentityByTelegramUserId as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'identity-1',
      status: 'REVOKED',
    });

    const { GET } = await import('../route');
    const res = assertResponse(
      await GET(makeRequest('stock', {}, { cookie: 'polyflow_tg=raw-token' }), domainParams('stock')),
    );
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.status).toBe('REVOKED');
  });

  it('returns 403 USER_INACTIVE when the user is inactive', async () => {
    const { prisma } = await import('@/lib/core/prisma');
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'user-1',
      name: 'Budi',
      role: 'ADMIN',
      isSuperAdmin: false,
      isActive: false,
    });

    const { GET } = await import('../route');
    const res = assertResponse(
      await GET(makeRequest('stock', {}, { cookie: 'polyflow_tg=raw-token' }), domainParams('stock')),
    );
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.status).toBe('USER_INACTIVE');
  });

  it('returns 400 when domain is unknown', async () => {
    const { GET } = await import('../route');
    const res = assertResponse(
      await GET(makeRequest('xyz', {}, { cookie: 'polyflow_tg=raw-token' }), domainParams('xyz')),
    );

    expect(res.status).toBe(400);
  });

  it('returns 403 DOMAIN_FORBIDDEN when user lacks domain access', async () => {
    const { prisma } = await import('@/lib/core/prisma');
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'user-1',
      name: 'Budi',
      role: 'STAFF',
      isSuperAdmin: false,
      isActive: true,
    });
    (prisma.userRole.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.rolePermission.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const { GET } = await import('../route');
    const res = assertResponse(
      await GET(makeRequest('finance', {}, { cookie: 'polyflow_tg=raw-token' }), domainParams('finance')),
    );
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.status).toBe('DOMAIN_FORBIDDEN');
  });

  it('returns 200 with stock items on happy path', async () => {
    const { prisma } = await import('@/lib/core/prisma');
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        variantId: 'v1',
        productName: 'Tepung',
        variantName: 'Premium',
        skuCode: 'SKU-001',
        qty: BigInt(5),
        minStockAlert: BigInt(20),
        unit: 'kg',
      },
    ]);

    const { GET } = await import('../route');
    const res = assertResponse(
      await GET(makeRequest('stock', {}, { cookie: 'polyflow_tg=raw-token' }), domainParams('stock')),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.domain).toBe('stock');
    expect(body.items.length).toBeGreaterThan(0);
    const item = body.items[0];
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('title');
    expect(item).toHaveProperty('subtitle');
    expect(item).toHaveProperty('status');
    expect(item).toHaveProperty('statusVariant');
    expect(item).toHaveProperty('meta');
  });

  it('returns 200 with sales items on happy path', async () => {
    const { prisma } = await import('@/lib/core/prisma');
    (prisma.salesOrder.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'so-1',
        orderNumber: 'SO-001',
        status: 'CONFIRMED',
        totalAmount: 1500000,
        orderDate: new Date('2026-07-20'),
        customer: { name: 'PT Maju' },
      },
    ]);
    (prisma.salesOrder.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const { GET } = await import('../route');
    const res = assertResponse(
      await GET(makeRequest('sales', {}, { cookie: 'polyflow_tg=raw-token' }), domainParams('sales')),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.domain).toBe('sales');
    expect(body.items.length).toBeGreaterThan(0);
    const item = body.items[0];
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('title');
    expect(item).toHaveProperty('subtitle');
    expect(item).toHaveProperty('status');
    expect(item).toHaveProperty('statusVariant');
    expect(item).toHaveProperty('meta');
  });

  it('returns 200 with production items on happy path', async () => {
    const { prisma } = await import('@/lib/core/prisma');
    (prisma.productionOrder.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'po-1',
        orderNumber: 'PROD-001',
        status: 'IN_PROGRESS',
        plannedQuantity: 100,
        bom: { productVariant: { name: 'Produk A' } },
        location: { name: 'Gudang 1' },
      },
    ]);
    (prisma.productionOrder.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const { GET } = await import('../route');
    const res = assertResponse(
      await GET(makeRequest('production', {}, { cookie: 'polyflow_tg=raw-token' }), domainParams('production')),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.domain).toBe('production');
    expect(body.items.length).toBeGreaterThan(0);
    const item = body.items[0];
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('title');
    expect(item).toHaveProperty('subtitle');
    expect(item).toHaveProperty('status');
    expect(item).toHaveProperty('statusVariant');
    expect(item).toHaveProperty('meta');
  });

  it('returns 200 with finance items on happy path', async () => {
    const { prisma } = await import('@/lib/core/prisma');
    (prisma.invoice.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'inv-1',
        invoiceNumber: 'INV-001',
        status: 'OVERDUE',
        totalAmount: 5000000,
        paidAmount: 2000000,
        dueDate: new Date('2026-07-15'),
        salesOrder: { customer: { name: 'CV Jaya' } },
      },
    ]);
    (prisma.invoice.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const { GET } = await import('../route');
    const res = assertResponse(
      await GET(makeRequest('finance', {}, { cookie: 'polyflow_tg=raw-token' }), domainParams('finance')),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.domain).toBe('finance');
    expect(body.items.length).toBeGreaterThan(0);
    const item = body.items[0];
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('title');
    expect(item).toHaveProperty('subtitle');
    expect(item).toHaveProperty('status');
    expect(item).toHaveProperty('statusVariant');
    expect(item).toHaveProperty('meta');
  });

  it('returns 200 with purchasing items on happy path', async () => {
    const { prisma } = await import('@/lib/core/prisma');
    (prisma.purchaseOrder.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'purch-1',
        orderNumber: 'PO-001',
        status: 'SENT',
        totalAmount: 3000000,
        orderDate: new Date('2026-07-18'),
        supplier: { name: 'PT Supplier' },
      },
    ]);
    (prisma.purchaseOrder.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const { GET } = await import('../route');
    const res = assertResponse(
      await GET(makeRequest('purchasing', {}, { cookie: 'polyflow_tg=raw-token' }), domainParams('purchasing')),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.domain).toBe('purchasing');
    expect(body.items.length).toBeGreaterThan(0);
    const item = body.items[0];
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('title');
    expect(item).toHaveProperty('subtitle');
    expect(item).toHaveProperty('status');
    expect(item).toHaveProperty('statusVariant');
    expect(item).toHaveProperty('meta');
  });

  it('returns 200 with hasMore false when data is fewer than pageSize', async () => {
    const { prisma } = await import('@/lib/core/prisma');
    (prisma.salesOrder.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'so-1',
        orderNumber: 'SO-001',
        status: 'CONFIRMED',
        totalAmount: 1000000,
        orderDate: new Date('2026-07-25'),
        customer: { name: 'PT Satu' },
      },
    ]);
    (prisma.salesOrder.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const { GET } = await import('../route');
    const res = assertResponse(
      await GET(makeRequest('sales', {}, { cookie: 'polyflow_tg=raw-token' }), domainParams('sales')),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.hasMore).toBe(false);
    expect(body.total).toBe(1);
    expect(body.items.length).toBe(1);
  });
});
