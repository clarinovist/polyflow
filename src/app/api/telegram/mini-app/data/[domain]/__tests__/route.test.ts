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

vi.mock('@/services/sales/price-list-service', () => ({
  listPricesByProduct: vi.fn(),
}));

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

describe('Telegram mini-app data/price — gate ADMIN & pemetaan harga', () => {
  // Dipanggil demi efek samping beforeEach (stub sesi + user ADMIN default);
  // nilainya tidak dipakai di blok ini.
  setupSession();

  const priceRow = {
    variantId: 'var-1',
    skuCode: 'BAL000001',
    variantName: 'Rafia 1kg',
    productName: 'Tali Rafia',
    productType: 'FINISHED_GOOD',
    basePrice: 15000,
    customPriceCount: 0,
    minPrice: null,
    maxPrice: null,
    prices: [],
  };

  async function mockPrices(rows: unknown[], total = rows.length) {
    const { listPricesByProduct } = await import('@/services/sales/price-list-service');
    (listPricesByProduct as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: rows,
      total,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
    return listPricesByProduct as ReturnType<typeof vi.fn>;
  }

  it('returns 403 PRICE_FORBIDDEN for SALES (harga hanya ADMIN)', async () => {
    const { prisma } = await import('@/lib/core/prisma');
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'user-1',
      name: 'Putri',
      role: 'SALES',
      isSuperAdmin: false,
      isActive: true,
    });
    (prisma.userRole.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.rolePermission.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { resource: '/sales' },
      { resource: '/sales/price-list' },
    ]);

    const { GET } = await import('../route');
    const res = assertResponse(
      await GET(makeRequest('price', {}, { cookie: 'polyflow_tg=raw-token' }), domainParams('price')),
    );
    const body = await res.json();

    expect(res.status).toBe(403);
    // SALES tidak pernah mendapat domain 'price' dari computeAllowedDomains,
    // jadi ia tertahan di gate domain lebih dulu. Gate PRICE_FORBIDDEN di
    // route adalah lapis kedua (defense-in-depth) yang secara desain tidak
    // terjangkau lewat jalur normal — sengaja tidak dites lewat mock global
    // karena stub yang bocor lintas-test (clearAllMocks tidak mereset
    // implementasi) merusak seluruh berkas ini.
    expect(body.status).toBe('DOMAIN_FORBIDDEN');
  });

  it('returns 200 for ADMIN', async () => {
    await mockPrices([priceRow]);

    const { GET } = await import('../route');
    const res = assertResponse(
      await GET(makeRequest('price', {}, { cookie: 'polyflow_tg=raw-token' }), domainParams('price')),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.domain).toBe('price');
    expect(body.items.length).toBe(1);
  });

  it('returns 200 for superadmin', async () => {
    const { prisma } = await import('@/lib/core/prisma');
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'user-1',
      name: 'Owner',
      role: 'STAFF',
      isSuperAdmin: true,
      isActive: true,
    });
    await mockPrices([priceRow]);

    const { GET } = await import('../route');
    const res = assertResponse(
      await GET(makeRequest('price', {}, { cookie: 'polyflow_tg=raw-token' }), domainParams('price')),
    );

    expect(res.status).toBe(200);
  });

  it('mengubah page 0-based route menjadi 1-based service', async () => {
    const spy = await mockPrices([priceRow]);

    const { GET } = await import('../route');
    // page=0 -> service harus dipanggil dengan page 1
    await GET(makeRequest('price', {}, { cookie: 'polyflow_tg=raw-token' }), domainParams('price'));
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }));

    // page=2 -> service harus dipanggil dengan page 3
    await GET(
      makeRequest('price', { page: '2' }, { cookie: 'polyflow_tg=raw-token' }),
      domainParams('price'),
    );
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ page: 3 }));
  });

  it('meneruskan q sebagai search ke service', async () => {
    const spy = await mockPrices([priceRow]);

    const { GET } = await import('../route');
    await GET(
      makeRequest('price', { q: '  rafia  ' }, { cookie: 'polyflow_tg=raw-token' }),
      domainParams('price'),
    );

    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'rafia' }));
  });

  it('filter custom mengirim onlyWithCustomPrice true', async () => {
    const spy = await mockPrices([priceRow]);

    const { GET } = await import('../route');
    await GET(
      makeRequest('price', { filter: 'custom' }, { cookie: 'polyflow_tg=raw-token' }),
      domainParams('price'),
    );

    expect(spy).toHaveBeenLastCalledWith(
      expect.objectContaining({ onlyWithCustomPrice: true }),
    );
  });

  it('filter default all tidak mengaktifkan onlyWithCustomPrice', async () => {
    const spy = await mockPrices([priceRow]);

    const { GET } = await import('../route');
    const res = assertResponse(
      await GET(makeRequest('price', {}, { cookie: 'polyflow_tg=raw-token' }), domainParams('price')),
    );
    const body = await res.json();

    expect(body.filter).toBe('all');
    expect(spy).toHaveBeenLastCalledWith(
      expect.objectContaining({ onlyWithCustomPrice: false }),
    );
  });

  it('menampilkan "Harga belum diset" saat tidak ada harga apa pun', async () => {
    await mockPrices([{ ...priceRow, basePrice: null }]);

    const { GET } = await import('../route');
    const res = assertResponse(
      await GET(makeRequest('price', {}, { cookie: 'polyflow_tg=raw-token' }), domainParams('price')),
    );
    const body = await res.json();

    expect(body.items[0].meta).toBe('Harga belum diset');
    expect(body.items[0].status).toBe('HARGA UMUM');
    expect(body.items[0].statusVariant).toBe('neutral');
  });

  it('menampilkan rentang harga khusus saat min != max', async () => {
    await mockPrices([
      { ...priceRow, customPriceCount: 3, minPrice: 12000, maxPrice: 14000 },
    ]);

    const { GET } = await import('../route');
    const res = assertResponse(
      await GET(makeRequest('price', {}, { cookie: 'polyflow_tg=raw-token' }), domainParams('price')),
    );
    const body = await res.json();

    expect(body.items[0].status).toBe('3 HARGA KHUSUS');
    expect(body.items[0].statusVariant).toBe('warning');
    expect(body.items[0].meta).toContain('Umum Rp 15.000');
    expect(body.items[0].meta).toContain('Rp 12.000');
    expect(body.items[0].meta).toContain('Rp 14.000');
  });

  it('menampilkan satu harga khusus saat min == max', async () => {
    await mockPrices([
      { ...priceRow, customPriceCount: 1, minPrice: 13000, maxPrice: 13000 },
    ]);

    const { GET } = await import('../route');
    const res = assertResponse(
      await GET(makeRequest('price', {}, { cookie: 'polyflow_tg=raw-token' }), domainParams('price')),
    );
    const body = await res.json();

    expect(body.items[0].meta).toContain('khusus Rp 13.000');
    expect(body.items[0].meta).not.toContain('–');
  });

  it('menandai basePrice kosong tapi ada harga khusus', async () => {
    await mockPrices([
      {
        ...priceRow,
        basePrice: null,
        customPriceCount: 2,
        minPrice: 9000,
        maxPrice: 9500,
      },
    ]);

    const { GET } = await import('../route');
    const res = assertResponse(
      await GET(makeRequest('price', {}, { cookie: 'polyflow_tg=raw-token' }), domainParams('price')),
    );
    const body = await res.json();

    expect(body.items[0].meta).toContain('Umum belum diset');
    expect(body.items[0].meta).toContain('Rp 9.000');
  });

  it('memetakan judul dan SKU ke DataItem', async () => {
    await mockPrices([priceRow]);

    const { GET } = await import('../route');
    const res = assertResponse(
      await GET(makeRequest('price', {}, { cookie: 'polyflow_tg=raw-token' }), domainParams('price')),
    );
    const body = await res.json();

    expect(body.items[0].id).toBe('var-1');
    expect(body.items[0].title).toBe('Tali Rafia — Rafia 1kg');
    expect(body.items[0].subtitle).toBe('SKU: BAL000001');
  });

  it('menghitung hasMore dari total service', async () => {
    await mockPrices([priceRow], 45);

    const { GET } = await import('../route');
    const res = assertResponse(
      await GET(makeRequest('price', {}, { cookie: 'polyflow_tg=raw-token' }), domainParams('price')),
    );
    const body = await res.json();

    expect(body.total).toBe(45);
    expect(body.hasMore).toBe(true);
  });

  it('tidak meneruskan q untuk domain non-harga', async () => {
    const { prisma } = await import('@/lib/core/prisma');
    (prisma.salesOrder.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.salesOrder.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const { GET } = await import('../route');
    const res = assertResponse(
      await GET(
        makeRequest('sales', { q: 'rafia' }, { cookie: 'polyflow_tg=raw-token' }),
        domainParams('sales'),
      ),
    );

    // Tidak error, dan service harga tidak tersentuh.
    expect(res.status).toBe(200);
    const { listPricesByProduct } = await import('@/services/sales/price-list-service');
    expect(listPricesByProduct).not.toHaveBeenCalled();
  });
});

describe('Telegram mini-app data/stock — SQL fetchStock (Fase 2)', () => {
  setupSession();

  /**
   * Rekonstruksi query terakhir yang dikirim ke $queryRaw.
   *
   * PENTING (diverifikasi 2026-08-24): karena `$queryRaw` di-mock dengan
   * `vi.fn()`, ia menerima argumen tagged template MENTAH —
   * `(TemplateStringsArray, ...values)` — bukan objek `Prisma.Sql`. Jadi:
   *   arg[0]  = potongan string statis
   *   arg[1:] = nilai yang diinterpolasi
   *
   * `sqlStatic` = hanya bagian statis (untuk memastikan klausa BENAR-BENAR
   * menyatu ke SQL), `values` = nilai interpolasi (untuk memastikan klausa
   * TIDAK menyelinap sebagai parameter).
   *
   * Nilai bertipe `Prisma.Sql` (punya getter `.sql`) di-render supaya klausa
   * yang disisipkan lewat `Prisma.sql` tetap terlihat sebagai SQL.
   */
  async function lastStockSql(): Promise<{
    sqlStatic: string;
    sqlFull: string;
    values: unknown[];
  }> {
    const { prisma } = await import('@/lib/core/prisma');
    const calls = (prisma.$queryRaw as ReturnType<typeof vi.fn>).mock.calls;
    const call = calls[calls.length - 1];

    const strings = call[0] as unknown as readonly string[];
    const values = call.slice(1);

    const sqlStatic = Array.isArray(strings) ? strings.join(' ') : '';

    const rendered = values.map((v) => {
      const maybeSql = (v as { sql?: unknown } | null)?.sql;
      return typeof maybeSql === 'string' ? maybeSql : '';
    });

    const sqlFull = Array.isArray(strings)
      ? strings.reduce(
          (acc, part, i) => acc + part + (rendered[i] ?? ''),
          '',
        )
      : '';

    return { sqlStatic, sqlFull, values };
  }

  async function callStock(filter?: string) {
    const { GET } = await import('../route');
    const query: Record<string, string> = filter ? { filter } : {};
    return assertResponse(
      await GET(
        makeRequest('stock', query, { cookie: 'polyflow_tg=raw-token' }),
        domainParams('stock'),
      ),
    );
  }

  it('menyaring varian terarsip (bug D)', async () => {
    await callStock();
    const { sqlStatic } = await lastStockSql();
    expect(sqlStatic).toContain('"archivedAt" IS NULL');
  });

  it('filter "all" TIDAK memakai HAVING minStockAlert > 0 (bug A)', async () => {
    await callStock('all');
    const { sqlFull, values } = await lastStockSql();

    // Cabang all harus tanpa HAVING sama sekali, jadi SKU tanpa batas minimum
    // ikut tampil. Sebelum fix, klausa ini selalu ada.
    expect(sqlFull).not.toContain('HAVING');
    // Dan tidak boleh ada HAVING yang menyelinap sebagai parameter (bug lama:
    // string di-interpolasi jadi $1 alih-alih SQL).
    expect(
      values.some((v) => typeof v === 'string' && v.includes('HAVING')),
    ).toBe(false);
  });

  it('filter "critical" menyisipkan HAVING sebagai SQL, bukan parameter', async () => {
    await callStock('critical');
    const { sqlFull, values } = await lastStockSql();

    expect(sqlFull).toContain('HAVING');
    expect(sqlFull).toContain('minStockAlert');
    // Regresi paling penting: klausa HAVING harus menyatu ke SQL. Kalau ia
    // dikirim sebagai nilai parameter (string biasa), Postgres menerimanya
    // sebagai $1 dan query gagal / klausanya tidak berefek.
    expect(
      values.some((v) => typeof v === 'string' && v.includes('HAVING')),
    ).toBe(false);
  });

  it('tidak menandai CRITICAL saat minStockAlert 0 (batas belum diset)', async () => {
    const { prisma } = await import('@/lib/core/prisma');
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        variantId: 'v-1',
        productName: 'Tali Rafia',
        variantName: 'Merah',
        skuCode: 'BAL1',
        qty: BigInt(0),
        minStockAlert: BigInt(0),
        unit: 'BAL',
      },
    ]);

    const res = await callStock('all');
    const body = await res.json();

    expect(body.items[0].status).toBe('OK');
    expect(body.items[0].statusVariant).toBe('ok');
  });

  it('menandai CRITICAL saat qty di bawah batas minimum', async () => {
    const { prisma } = await import('@/lib/core/prisma');
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        variantId: 'v-2',
        productName: 'Tali Rafia',
        variantName: 'Biru',
        skuCode: 'BAL2',
        qty: BigInt(3),
        minStockAlert: BigInt(10),
        unit: 'BAL',
      },
    ]);

    const res = await callStock('critical');
    const body = await res.json();

    expect(body.items[0].status).toBe('CRITICAL');
    expect(body.items[0].statusVariant).toBe('critical');
  });
});
