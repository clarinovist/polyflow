import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma = {
    invoice: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    purchaseInvoice: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    journalEntry: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    bankReconciliation: {
      count: vi.fn(),
    },
    journalLine: {
      aggregate: vi.fn(),
    },
    fiscalPeriod: {
      count: vi.fn(),
      findFirst: vi.fn(),
    },
  };
  return { mockPrisma };
});

vi.mock('@/lib/core/prisma', () => ({
  prisma: mockPrisma,
}));

vi.mock('@/lib/core/tenant', () => ({
  withTenant: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock('@/lib/tools/auth-checks', () => ({
  requireAuth: vi.fn().mockResolvedValue({ user: { id: 'u1' } }),
}));

vi.mock('@/lib/errors/errors', () => ({
  safeAction: async (fn: () => Promise<unknown>) => {
    try {
      const data = await fn();
      return { success: true as const, data };
    } catch (e) {
      return { success: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  },
}));

import { getFinanceShiftBoard } from '../finance-dashboard';

const NOW = new Date('2026-07-22T10:00:00Z');
const YESTERDAY = new Date('2026-07-21T10:00:00Z');
const LAST_WEEK = new Date('2026-07-15T10:00:00Z');

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    invoiceNumber: 'INV-001',
    totalAmount: { toNumber: () => 100_000 },
    paidAmount: { toNumber: () => 0 },
    dueDate: YESTERDAY,
    salesOrder: { customer: { name: 'Toko A' } },
    ...overrides,
  };
}

function makePurchaseInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pi-1',
    invoiceNumber: 'PI-001',
    totalAmount: { toNumber: () => 200_000 },
    paidAmount: { toNumber: () => 50_000 },
    dueDate: LAST_WEEK,
    purchaseOrder: { supplier: { name: 'Supplier B' } },
    ...overrides,
  };
}

function makeJournal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'je-1',
    entryNumber: 'JE-001',
    entryDate: new Date('2026-07-20'),
    description: 'Test journal',
    ...overrides,
  };
}

function setupMocks(overrides: {
  arOverdue?: unknown[];
  apOverdue?: unknown[];
  arUnpaid?: unknown[];
  apUnpaid?: unknown[];
  draftCount?: number;
  draftTop?: unknown[];
  openRecs?: number;
  revenueAgg?: { _sum: { credit: unknown; debit: unknown } };
  cashAgg?: { _sum: { debit: unknown; credit: unknown } };
  arAgg?: { _sum: { debit: unknown; credit: unknown } };
  apAgg?: { _sum: { credit: unknown; debit: unknown } };
  openPeriods?: number;
  currentPeriod?: unknown;
} = {}) {
  const arOverdue = overrides.arOverdue ?? [makeInvoice()];
  const apOverdue = overrides.apOverdue ?? [makePurchaseInvoice()];
  const arUnpaid = overrides.arUnpaid ?? arOverdue;
  const apUnpaid = overrides.apUnpaid ?? apOverdue;

  // findMany calls: [arOverdue, apOverdue, arUnpaid, apUnpaid, draftTop]
  const findManyResults = [arOverdue, apOverdue, arUnpaid, apUnpaid, overrides.draftTop ?? [makeJournal()]];
  let findManyIdx = 0;
  mockPrisma.invoice.findMany.mockImplementation(async () => findManyResults[findManyIdx++]);
  mockPrisma.purchaseInvoice.findMany.mockImplementation(async () => findManyResults[findManyIdx++]);

  // Second call for unpaid (reuse same mock since they alternate with findMany)
  // Actually we need to handle the Promise.all order. Let me re-approach:
  // The function calls:
  // 1. prisma.invoice.findMany (overdue)
  // 2. prisma.purchaseInvoice.findMany (overdue)
  // 3. prisma.invoice.findMany (unpaid - same table, different where)
  // 4. prisma.purchaseInvoice.findMany (unpaid)
  // 5. prisma.journalEntry.count (draft)
  // 6. prisma.journalEntry.findMany (draft top)
  // 7. prisma.bankReconciliation.count (open)
  // 8-11. prisma.journalLine.aggregate (4x: revenue, cash, ar, ap)
  // 12. prisma.fiscalPeriod.count (open)
  // 13. prisma.fiscalPeriod.findFirst (current)

  // Reset and use call-index approach for each mock
  mockPrisma.invoice.findMany
    .mockResolvedValueOnce(arOverdue)   // overdue
    .mockResolvedValueOnce(arUnpaid);   // unpaid
  mockPrisma.purchaseInvoice.findMany
    .mockResolvedValueOnce(apOverdue)   // overdue
    .mockResolvedValueOnce(apUnpaid);   // unpaid

  mockPrisma.journalEntry.count.mockResolvedValue(overrides.draftCount ?? 2);
  mockPrisma.journalEntry.findMany.mockResolvedValue(overrides.draftTop ?? [makeJournal()]);
  mockPrisma.bankReconciliation.count.mockResolvedValue(overrides.openRecs ?? 1);

  // GL aggregates: revenue, cash, ar, ap
  const aggResults = [
    overrides.revenueAgg ?? { _sum: { credit: 5_000_000, debit: 0 } },
    overrides.cashAgg ?? { _sum: { debit: 3_000_000, credit: 1_000_000 } },
    overrides.arAgg ?? { _sum: { debit: 800_000, credit: 200_000 } },
    overrides.apAgg ?? { _sum: { credit: 400_000, debit: 100_000 } },
  ];
  let aggIdx = 0;
  mockPrisma.journalLine.aggregate.mockImplementation(async () => aggResults[aggIdx++]);

  mockPrisma.fiscalPeriod.count.mockResolvedValue(overrides.openPeriods ?? 3);
  mockPrisma.fiscalPeriod.findFirst.mockResolvedValue(overrides.currentPeriod ?? {
    id: 'fp-1',
    name: 'Juli 2026',
    endDate: new Date('2026-07-31'),
    status: 'OPEN',
  });
}

describe('getFinanceShiftBoard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns queue counts for AR/AP overdue and unpaid', async () => {
    setupMocks({
      arOverdue: [makeInvoice(), makeInvoice({ id: 'inv-2', invoiceNumber: 'INV-002' })],
      apOverdue: [makePurchaseInvoice()],
      arUnpaid: [makeInvoice(), makeInvoice({ id: 'inv-2' }), makeInvoice({ id: 'inv-3', paidAmount: { toNumber: () => 50_000 }, totalAmount: { toNumber: () => 100_000 } })],
      apUnpaid: [makePurchaseInvoice(), makePurchaseInvoice({ id: 'pi-2' })],
    });

    const res = await getFinanceShiftBoard({ startDate: new Date('2026-07-01'), endDate: new Date('2026-07-31') });
    expect(res.success).toBe(true);
    if (!res.success || !res.data) return;

    expect(res.data.queues.arOverdueCount).toBe(2);
    expect(res.data.queues.apOverdueCount).toBe(1);
    expect(res.data.queues.arUnpaidCount).toBe(3);
    expect(res.data.queues.apUnpaidCount).toBe(2);
    expect(res.data.queues.draftJournals).toBe(2);
    expect(res.data.queues.openBankRecs).toBe(1);
  });

  it('calculates overdue amounts from remaining (total - paid)', async () => {
    setupMocks({
      arOverdue: [makeInvoice({ totalAmount: { toNumber: () => 100_000 }, paidAmount: { toNumber: () => 20_000 } })],
      apOverdue: [makePurchaseInvoice({ totalAmount: { toNumber: () => 200_000 }, paidAmount: { toNumber: () => 0 } })],
      arUnpaid: [makeInvoice({ totalAmount: { toNumber: () => 100_000 }, paidAmount: { toNumber: () => 20_000 } })],
      apUnpaid: [makePurchaseInvoice({ totalAmount: { toNumber: () => 200_000 }, paidAmount: { toNumber: () => 0 } })],
    });

    const res = await getFinanceShiftBoard({ startDate: new Date('2026-07-01'), endDate: new Date('2026-07-31') });
    expect(res.success).toBe(true);
    if (!res.success || !res.data) return;

    expect(res.data.queues.arOverdueAmount).toBe(80_000);
    expect(res.data.queues.apOverdueAmount).toBe(200_000);
    expect(res.data.queues.arUnpaidAmount).toBe(80_000);
    expect(res.data.queues.apUnpaidAmount).toBe(200_000);
  });

  it('builds attention lists with top AR/AP overdue and draft journals', async () => {
    setupMocks({
      arOverdue: [
        makeInvoice({ id: 'ar-1', invoiceNumber: 'INV-A1', totalAmount: { toNumber: () => 50_000 }, paidAmount: { toNumber: () => 0 }, salesOrder: { customer: { name: 'Customer X' } } }),
        makeInvoice({ id: 'ar-2', invoiceNumber: 'INV-A2', totalAmount: { toNumber: () => 30_000 }, paidAmount: { toNumber: () => 10_000 }, salesOrder: { customer: { name: 'Customer Y' } } }),
      ],
      apOverdue: [
        makePurchaseInvoice({ id: 'ap-1', invoiceNumber: 'PI-B1', totalAmount: { toNumber: () => 100_000 }, paidAmount: { toNumber: () => 0 }, purchaseOrder: { supplier: { name: 'Supplier Z' } } }),
      ],
      draftTop: [
        makeJournal({ id: 'je-1', entryNumber: 'JE-001', description: 'Draft 1' }),
        makeJournal({ id: 'je-2', entryNumber: 'JE-002', description: 'Draft 2' }),
      ],
    });

    const res = await getFinanceShiftBoard({ startDate: new Date('2026-07-01'), endDate: new Date('2026-07-31') });
    expect(res.success).toBe(true);
    if (!res.success || !res.data) return;

    expect(res.data.attention.arOverdue).toHaveLength(2);
    expect(res.data.attention.arOverdue[0].customerName).toBe('Customer X');
    expect(res.data.attention.arOverdue[0].remaining).toBe(50_000);

    expect(res.data.attention.apOverdue).toHaveLength(1);
    expect(res.data.attention.apOverdue[0].supplierName).toBe('Supplier Z');
    expect(res.data.attention.apOverdue[0].remaining).toBe(100_000);

    expect(res.data.attention.draftJournals).toHaveLength(2);
    expect(res.data.attention.draftJournals[0].entryNumber).toBe('JE-001');
  });

  it('calculates GL snapshot from journal lines (POSTED filter)', async () => {
    setupMocks({
      revenueAgg: { _sum: { credit: 10_000_000, debit: 500_000 } },
      cashAgg: { _sum: { debit: 6_000_000, credit: 3_000_000 } },
      arAgg: { _sum: { debit: 2_000_000, credit: 800_000 } },
      apAgg: { _sum: { credit: 1_500_000, debit: 600_000 } },
    });

    const res = await getFinanceShiftBoard({ startDate: new Date('2026-07-01'), endDate: new Date('2026-07-31') });
    expect(res.success).toBe(true);
    if (!res.success || !res.data) return;

    expect(res.data.snapshot.revenue).toBe(9_500_000);   // credit - debit
    expect(res.data.snapshot.cashPosition).toBe(3_000_000); // debit - credit
    expect(res.data.snapshot.arGl).toBe(1_200_000);       // debit - credit
    expect(res.data.snapshot.apGl).toBe(900_000);         // credit - debit
    expect(res.data.snapshot.definitions.revenue).toContain('4*');
    expect(res.data.snapshot.definitions.cash).toContain('111*');
  });

  it('returns period signal with current OPEN period and days to month end', async () => {
    setupMocks({
      openPeriods: 3,
      currentPeriod: {
        id: 'fp-jul',
        name: 'Juli 2026',
        endDate: new Date('2026-07-31'),
        status: 'OPEN',
      },
    });

    const res = await getFinanceShiftBoard({ startDate: new Date('2026-07-01'), endDate: new Date('2026-07-31') });
    expect(res.success).toBe(true);
    if (!res.success || !res.data) return;

    expect(res.data.period?.openCount).toBe(3);
    expect(res.data.period?.currentPeriod?.name).toBe('Juli 2026');
    expect(res.data.period?.currentPeriod?.status).toBe('OPEN');
    expect(res.data.period?.daysToMonthEnd).toBe(9); // Jul 22 → Jul 31 = 9 days
    expect(res.data.period?.reconThisMonth).toBe(1);
  });

  it('shows reconThisMonth count from completed reconciliations', async () => {
    vi.clearAllMocks();
    mockPrisma.invoice.findMany.mockResolvedValue([]);
    mockPrisma.purchaseInvoice.findMany.mockResolvedValue([]);
    mockPrisma.journalEntry.count.mockResolvedValue(0);
    mockPrisma.journalEntry.findMany.mockResolvedValue([]);
    mockPrisma.bankReconciliation.count.mockResolvedValue(2);
    mockPrisma.journalLine.aggregate.mockResolvedValue({ _sum: { credit: 0, debit: 0 } });
    mockPrisma.fiscalPeriod.count.mockResolvedValue(3);
    mockPrisma.fiscalPeriod.findFirst.mockResolvedValue({
      id: 'fp-jul', name: 'Juli 2026', endDate: new Date('2026-07-31'), status: 'OPEN',
    });

    const res = await getFinanceShiftBoard({ startDate: new Date('2026-07-01'), endDate: new Date('2026-07-31') });
    expect(res.success).toBe(true);
    if (!res.success || !res.data) return;

    expect(res.data.period?.reconThisMonth).toBe(2);
  });

  it('handles no current period gracefully', async () => {
    vi.clearAllMocks();
    // Reset all mocks for this test specifically
    mockPrisma.invoice.findMany.mockResolvedValue([]);
    mockPrisma.purchaseInvoice.findMany.mockResolvedValue([]);
    mockPrisma.journalEntry.count.mockResolvedValue(0);
    mockPrisma.journalEntry.findMany.mockResolvedValue([]);
    mockPrisma.bankReconciliation.count.mockResolvedValue(0);
    mockPrisma.journalLine.aggregate.mockResolvedValue({ _sum: { credit: 0, debit: 0 } });
    mockPrisma.fiscalPeriod.count.mockResolvedValue(3);
    mockPrisma.fiscalPeriod.findFirst.mockResolvedValue(null);

    const res = await getFinanceShiftBoard({ startDate: new Date('2026-07-01'), endDate: new Date('2026-07-31') });
    expect(res.success).toBe(true);
    if (!res.success || !res.data) return;

    expect(res.data.period?.currentPeriod).toBeNull();
    expect(res.data.period?.daysToMonthEnd).toBeNull();
  });

  it('returns empty attention lists when no overdue/draft', async () => {
    setupMocks({
      arOverdue: [],
      apOverdue: [],
      arUnpaid: [],
      apUnpaid: [],
      draftTop: [],
      draftCount: 0,
      openRecs: 0,
    });

    const res = await getFinanceShiftBoard({ startDate: new Date('2026-07-01'), endDate: new Date('2026-07-31') });
    expect(res.success).toBe(true);
    if (!res.success || !res.data) return;

    expect(res.data.queues.arOverdueCount).toBe(0);
    expect(res.data.queues.apOverdueCount).toBe(0);
    expect(res.data.queues.draftJournals).toBe(0);
    expect(res.data.queues.openBankRecs).toBe(0);
    expect(res.data.attention.arOverdue).toHaveLength(0);
    expect(res.data.attention.apOverdue).toHaveLength(0);
    expect(res.data.attention.draftJournals).toHaveLength(0);
  });

  it('truncates attention lists to 5 items', async () => {
    const arOverdue = Array.from({ length: 7 }, (_, i) =>
      makeInvoice({ id: `ar-${i}`, invoiceNumber: `INV-${i}`, salesOrder: { customer: { name: `C${i}` } } })
    );
    setupMocks({ arOverdue, arUnpaid: arOverdue });

    const res = await getFinanceShiftBoard({ startDate: new Date('2026-07-01'), endDate: new Date('2026-07-31') });
    expect(res.success).toBe(true);
    if (!res.success || !res.data) return;

    // findMany returns all 7, but board should have count=7 and attention truncated
    // Note: the board uses findMany without take, then slices. The count = findMany.length.
    expect(res.data.attention.arOverdue).toHaveLength(5);
  });

  it('periodLabel reflects date range', async () => {
    setupMocks();

    const res = await getFinanceShiftBoard({ startDate: new Date('2026-07-01'), endDate: new Date('2026-07-31') });
    expect(res.success).toBe(true);
    if (!res.success || !res.data) return;

    expect(res.data.snapshot.periodLabel).toContain('Jul');
    expect(res.data.snapshot.periodLabel).toContain('2026');
  });
});
