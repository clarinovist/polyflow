import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';

// ── Mock prisma ─────────────────────────────────────────────────────

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        collectionActivity: {
            create: vi.fn(),
            findMany: vi.fn(),
        },
        invoice: {
            findMany: vi.fn(),
        },
        customerSalesAssignment: {
            findMany: vi.fn(),
        },
        user: {
            findMany: vi.fn(),
        },
    },
}));

// Import after mock
import { prisma } from '@/lib/core/prisma';
import {
    CollectionService,
    resolveSalesRepIdFromInvoice,
    buildCustomerAssignmentMap,
} from '../collection-service';
import { getBucket } from '../../finance/aging-service';

const mockCreate = vi.mocked(prisma.collectionActivity.create);
const mockFindMany = vi.mocked(prisma.collectionActivity.findMany);
const mockInvoiceFindMany = vi.mocked(prisma.invoice.findMany);
const mockCsaFindMany = vi.mocked(prisma.customerSalesAssignment.findMany);
const mockUserFindMany = vi.mocked(prisma.user.findMany);

// ── Helpers ─────────────────────────────────────────────────────────

function dec(n: number) {
    return new Decimal(n);
}

function makeInvoice(opts: {
    id: string;
    invoiceNumber?: string;
    totalAmount?: number;
    paidAmount?: number;
    invoiceDate?: Date;
    dueDate?: Date | null;
    status?: string;
    salesRepId?: string | null;
    customerId?: string | null;
}) {
    return {
        id: opts.id,
        invoiceNumber: opts.invoiceNumber ?? `INV-${opts.id}`,
        totalAmount: dec(opts.totalAmount ?? 1000),
        paidAmount: dec(opts.paidAmount ?? 0),
        invoiceDate: opts.invoiceDate ?? new Date('2026-07-01T00:00:00Z'),
        dueDate: (opts.dueDate === null ? null : (opts.dueDate ?? null)) as Date | null,
        status: opts.status ?? 'UNPAID',
        salesOrder: {
            salesRepId: opts.salesRepId ?? null,
            customerId: opts.customerId ?? null,
        },
    };
}

describe('collection-service', () => {
    beforeEach(() => vi.clearAllMocks());

    // ── logCollectionActivity ────────────────────────────────────────

    describe('logCollectionActivity', () => {
        it('PROMISE_TO_PAY requires promisedDate and promisedAmount', async () => {
            await expect(
                CollectionService.logCollectionActivity({
                    invoiceId: 'inv-1',
                    userId: 'u1',
                    type: 'PROMISE_TO_PAY',
                    // missing promisedDate + promisedAmount
                } as never),
            ).rejects.toThrow(/promisedDate/i);

            await expect(
                CollectionService.logCollectionActivity({
                    invoiceId: 'inv-1',
                    userId: 'u1',
                    type: 'PROMISE_TO_PAY',
                    promisedDate: new Date('2026-08-10'),
                    // missing promisedAmount
                } as never),
            ).rejects.toThrow(/promisedAmount/i);
        });

        it('other types do not require promisedDate/Amount', async () => {
            mockCreate.mockResolvedValue({
                id: 'ca-1',
                invoiceId: 'inv-1',
                userId: 'u1',
                type: 'CALL',
            } as never);

            const res = await CollectionService.logCollectionActivity({
                invoiceId: 'inv-1',
                userId: 'u1',
                type: 'CALL',
                notes: 'customer answered',
            });

            expect(mockCreate).toHaveBeenCalled();
            const callData = (mockCreate.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0] as { data: Record<string, unknown> };
            // Must NOT change InvoiceStatus — only creates collectionActivity
            expect(callData.data).toBeDefined();
            expect((callData.data as Record<string, unknown>).invoiceId).toBe('inv-1');
            expect(res).toBeDefined();
        });

        it('PROMISE_TO_PAY with valid data creates record', async () => {
            mockCreate.mockResolvedValue({ id: 'ca-2' } as never);

            await CollectionService.logCollectionActivity({
                invoiceId: 'inv-1',
                userId: 'u1',
                type: 'PROMISE_TO_PAY',
                promisedDate: new Date('2026-08-15T00:00:00Z'),
                promisedAmount: 500000,
                notes: 'janji bayar tgl 15',
            });

            expect(mockCreate).toHaveBeenCalledTimes(1);
            const arg = (mockCreate.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0] as { data: Record<string, unknown> };
            expect(arg.data.type).toBe('PROMISE_TO_PAY');
            expect(arg.data.promisedDate).toBeInstanceOf(Date);
            expect(arg.data.promisedAmount).toBe(500000);
        });

        it('does not mutate InvoiceStatus (Q3)', async () => {
            // The service file should never import or call invoice update.
            // We verify by reading source — but also ensure create does not include status mutation.
            mockCreate.mockResolvedValue({ id: 'ca-x' } as never);
            await CollectionService.logCollectionActivity({
                invoiceId: 'inv-1',
                userId: 'u1',
                type: 'DISPUTE',
            });
            const arg = (mockCreate.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0] as { data: Record<string, unknown> };
            // data should NOT contain invoice status update
            expect(arg.data).not.toHaveProperty('status');
            // ensure prisma.invoice.update was never mocked/called (not present in mock)
            // — if implementation mistakenly changed status, it would need invoice.update which we didn't mock
            expect((prisma as unknown as { invoice: { update?: unknown } }).invoice.update).toBeUndefined();
        });
    });

    // ── listCollectionActivities ─────────────────────────────────────

    describe('listCollectionActivities', () => {
        it('filter by invoiceId and userId and date range', async () => {
            const fakeRows = [{ id: 'ca-1' }, { id: 'ca-2' }];
            mockFindMany.mockResolvedValue(fakeRows as never);

            const from = new Date('2026-08-01');
            const to = new Date('2026-08-31');

            const res = await CollectionService.listCollectionActivities({
                invoiceId: 'inv-1',
                userId: 'u1',
                from,
                to,
            });

            expect(mockFindMany).toHaveBeenCalled();
            const whereArg = mockFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
            expect(whereArg.where.invoiceId).toBe('inv-1');
            expect(whereArg.where.userId).toBe('u1');
            expect((whereArg.where.activityDate as { gte: Date }).gte).toBe(from);
            expect((whereArg.where.activityDate as { lte: Date }).lte).toBe(to);
            expect(res.length).toBe(2);
        });

        it('empty filter returns all (no where constraints)', async () => {
            mockFindMany.mockResolvedValue([] as never);
            await CollectionService.listCollectionActivities({});
            const whereArg = mockFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
            expect(Object.keys(whereArg.where).length).toBe(0);
        });

        it('orders by activityDate desc', async () => {
            mockFindMany.mockResolvedValue([] as never);
            await CollectionService.listCollectionActivities({});
            const arg = mockFindMany.mock.calls[0][0] as { orderBy: Record<string, string> };
            expect(arg.orderBy.activityDate).toBe('desc');
        });
    });

    // ── helpers: resolveSalesRepIdFromInvoice + buildCustomerAssignmentMap ──

    describe('resolveSalesRepIdFromInvoice pure', () => {
        it('prefers SO salesRepId over assignment', () => {
            const map = new Map([['cust-1', 'assigned-user']]);
            expect(
                resolveSalesRepIdFromInvoice({ salesRepId: 'rep-1', customerId: 'cust-1' }, map),
            ).toBe('rep-1');
        });

        it('falls back to active CustomerSalesAssignment', () => {
            const map = new Map([['cust-1', 'assigned-user']]);
            expect(
                resolveSalesRepIdFromInvoice({ salesRepId: null, customerId: 'cust-1' }, map),
            ).toBe('assigned-user');
        });

        it('unattributed when both missing', () => {
            const map = new Map<string, string>();
            expect(resolveSalesRepIdFromInvoice({ salesRepId: null, customerId: null }, map)).toBeNull();
            expect(resolveSalesRepIdFromInvoice({ salesRepId: null, customerId: 'cust-x' }, map)).toBeNull();
        });
    });

    describe('buildCustomerAssignmentMap pure', () => {
        it('primary wins over non-primary for same customer', () => {
            const map = buildCustomerAssignmentMap([
                { customerId: 'cust-1', userId: 'fallback', isPrimary: false },
                { customerId: 'cust-1', userId: 'primary', isPrimary: true },
            ]);
            expect(map.get('cust-1')).toBe('primary');
        });

        it('first primary wins, fallback used when no primary', () => {
            const map = buildCustomerAssignmentMap([
                { customerId: 'cust-1', userId: 'user-a', isPrimary: false },
                { customerId: 'cust-2', userId: 'user-b', isPrimary: true },
                { customerId: 'cust-2', userId: 'user-c', isPrimary: true },
            ]);
            expect(map.get('cust-1')).toBe('user-a');
            expect(map.get('cust-2')).toBe('user-b');
        });
    });

    // ── getBucket boundary (reuse check) ─────────────────────────────

    describe('getBucket boundary (reused from aging-service)', () => {
        it('boundary: -1 => notYetDue, 0/30 => 1-30, 31/60 => 31-60, 61/90 => 61-90, 91 => 90+', () => {
            expect(getBucket(-1)).toBe('notYetDue');
            expect(getBucket(-10)).toBe('notYetDue');
            expect(getBucket(0)).toBe('1-30');
            expect(getBucket(1)).toBe('1-30');
            expect(getBucket(30)).toBe('1-30');
            expect(getBucket(31)).toBe('31-60');
            expect(getBucket(60)).toBe('31-60');
            expect(getBucket(61)).toBe('61-90');
            expect(getBucket(90)).toBe('61-90');
            expect(getBucket(91)).toBe('90+');
            expect(getBucket(200)).toBe('90+');
        });
    });

    // ── getSalesArAging ──────────────────────────────────────────────

    describe('getSalesArAging', () => {
        function setupUsersMock(ids: string[]) {
            mockUserFindMany.mockResolvedValue(
                ids.map((id) => ({ id, name: `User ${id}` })) as never,
            );
        }

        it('bucket exactly at boundaries (30/60/90 days)', async () => {
            // asOf = 2026-08-01. invoice baseDate = asOf - days.
            const asOf = new Date('2026-08-01T00:00:00Z');
            const d = (days: number) => new Date(asOf.getTime() - days * 86400 * 1000);

            mockInvoiceFindMany.mockResolvedValue([
                makeInvoice({ id: 'inv-0', salesRepId: 'rep-1', invoiceDate: d(0), dueDate: d(0) }), // 0 days => 1-30
                makeInvoice({ id: 'inv-30', salesRepId: 'rep-1', invoiceDate: d(30), dueDate: d(30) }), // 30 => 1-30
                makeInvoice({ id: 'inv-31', salesRepId: 'rep-1', invoiceDate: d(31), dueDate: d(31) }), // 31 => 31-60
                makeInvoice({ id: 'inv-60', salesRepId: 'rep-1', invoiceDate: d(60), dueDate: d(60) }),
                makeInvoice({ id: 'inv-61', salesRepId: 'rep-1', invoiceDate: d(61), dueDate: d(61) }),
                makeInvoice({ id: 'inv-90', salesRepId: 'rep-1', invoiceDate: d(90), dueDate: d(90) }),
                makeInvoice({ id: 'inv-91', salesRepId: 'rep-1', invoiceDate: d(91), dueDate: d(91) }),
            ] as never);

            mockCsaFindMany.mockResolvedValue([] as never);
            setupUsersMock(['rep-1']);

            const rows = await CollectionService.getSalesArAging({ asOf });
            expect(rows.length).toBe(1);
            const row = rows[0];
            expect(row.salesRepId).toBe('rep-1');
            // Buckets:
            // 0,30 -> current (1-30) = 2 invoices
            // 31,60 -> days31to60 = 2
            // 61,90 -> days61to90 = 2
            // 91 -> over90 = 1
            expect(row.invoices.filter((i) => i.bucket === '1-30').length).toBe(2);
            expect(row.invoices.filter((i) => i.bucket === '31-60').length).toBe(2);
            expect(row.invoices.filter((i) => i.bucket === '61-90').length).toBe(2);
            expect(row.invoices.filter((i) => i.bucket === '90+').length).toBe(1);

            // totals
            expect(row.current).toBe(2000);
            expect(row.days31to60).toBe(2000);
            expect(row.days61to90).toBe(2000);
            expect(row.over90).toBe(1000);
        });

        it('invoice without salesRepId falls back to active CustomerSalesAssignment', async () => {
            const asOf = new Date('2026-08-01T00:00:00Z');
            mockInvoiceFindMany.mockResolvedValue([
                makeInvoice({ id: 'inv-1', salesRepId: null, customerId: 'cust-1' }),
            ] as never);

            mockCsaFindMany.mockResolvedValue([
                { customerId: 'cust-1', userId: 'rep-fallback', isPrimary: true },
            ] as never);

            setupUsersMock(['rep-fallback']);

            const rows = await CollectionService.getSalesArAging({ asOf });
            expect(rows.length).toBe(1);
            expect(rows[0].salesRepId).toBe('rep-fallback');
            expect(rows[0].invoices[0].salesRepId).toBe('rep-fallback');
        });

        it('invoice without salesRepId AND no active assignment => unattributed bucket', async () => {
            const asOf = new Date('2026-08-01T00:00:00Z');
            mockInvoiceFindMany.mockResolvedValue([
                makeInvoice({ id: 'inv-1', salesRepId: null, customerId: 'cust-unknown' }),
                makeInvoice({ id: 'inv-2', salesRepId: null, customerId: null }),
            ] as never);

            // No active assignment
            mockCsaFindMany.mockResolvedValue([] as never);
            mockUserFindMany.mockResolvedValue([] as never);

            const rows = await CollectionService.getSalesArAging({ asOf });
            // Should have 1 unattributed row
            expect(rows.length).toBe(1);
            expect(rows[0].salesRepId).toBeNull();
            expect(rows[0].salesRepName).toBe('Unattributed');
            expect(rows[0].invoices.length).toBe(2);
        });

        it('filter userId only returns that rep (unattributed excluded)', async () => {
            const asOf = new Date('2026-08-01T00:00:00Z');
            mockInvoiceFindMany.mockResolvedValue([
                makeInvoice({ id: 'inv-1', salesRepId: 'rep-1', customerId: 'cust-1' }),
                makeInvoice({ id: 'inv-2', salesRepId: 'rep-2', customerId: 'cust-2' }),
                makeInvoice({ id: 'inv-3', salesRepId: null, customerId: 'cust-3' }),
            ] as never);

            mockCsaFindMany.mockResolvedValue([] as never);
            setupUsersMock(['rep-1', 'rep-2']);

            const rows = await CollectionService.getSalesArAging({ asOf, userId: 'rep-1' });
            expect(rows.length).toBe(1);
            expect(rows[0].salesRepId).toBe('rep-1');
            expect(rows[0].invoices.length).toBe(1);
        });

        it('skips invoices with outstanding <= 0 and sorts by total desc', async () => {
            const asOf = new Date('2026-08-01T00:00:00Z');
            mockInvoiceFindMany.mockResolvedValue([
                makeInvoice({ id: 'inv-paid', salesRepId: 'rep-1', totalAmount: 1000, paidAmount: 1000 }),
                makeInvoice({ id: 'inv-partial', salesRepId: 'rep-1', totalAmount: 1000, paidAmount: 200 }),
                makeInvoice({ id: 'inv-full', salesRepId: 'rep-2', totalAmount: 5000, paidAmount: 0 }),
            ] as never);
            mockCsaFindMany.mockResolvedValue([] as never);
            setupUsersMock(['rep-1', 'rep-2']);

            const rows = await CollectionService.getSalesArAging({ asOf });
            // rep-2 total 5000 should come first, rep-1 800 second
            expect(rows.length).toBe(2);
            expect(rows[0].salesRepId).toBe('rep-2');
            expect(rows[0].total).toBe(5000);
            expect(rows[1].salesRepId).toBe('rep-1');
            expect(rows[1].total).toBe(800);
        });

        it('reuses getBucket logic — not reimplemented (getBucket called indirectly via bucket field)', async () => {
            const asOf = new Date('2026-08-01T00:00:00Z');
            const d = (days: number) => new Date(asOf.getTime() - days * 86400 * 1000);
            mockInvoiceFindMany.mockResolvedValue([
                makeInvoice({ id: 'inv-neg', salesRepId: 'rep-1', invoiceDate: d(-5), dueDate: d(-5) }),
            ] as never);
            mockCsaFindMany.mockResolvedValue([] as never);
            setupUsersMock(['rep-1']);

            const rows = await CollectionService.getSalesArAging({ asOf });
            expect(rows[0].invoices[0].bucket).toBe('notYetDue');
            expect(rows[0].notYetDue).toBe(1000);
        });
    });

    // ── getInvoicesWithoutCollectionActivity ─────────────────────────

    describe('getInvoicesWithoutCollectionActivity', () => {
        it('DB query uses collectionActivities.none filter (actionable=never touched)', () => {
            // The implementation must filter where collectionActivities: { none: {} }
            // We verify via the where arg passed to invoice.findMany
            mockInvoiceFindMany.mockResolvedValue([] as never);
            mockCsaFindMany.mockResolvedValue([] as never);
            return CollectionService.getInvoicesWithoutCollectionActivity({}).then(() => {
                expect(mockInvoiceFindMany).toHaveBeenCalled();
                const arg = mockInvoiceFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
                expect((arg.where as any).collectionActivities).toBeDefined();
                expect((arg.where as any).collectionActivities.none).toBeDefined();
            });
        });

        it('PAID/CANCELLED not returned even if no activity (status filtered at DB)', async () => {
            mockInvoiceFindMany.mockResolvedValue([] as never);
            mockCsaFindMany.mockResolvedValue([] as never);
            await CollectionService.getInvoicesWithoutCollectionActivity({});
            const arg = mockInvoiceFindMany.mock.calls[0][0] as {
                where: { status: { in: string[] } };
            };
            const statuses: string[] = arg.where.status.in;
            expect(statuses).toContain('UNPAID');
            expect(statuses).toContain('OVERDUE');
            expect(statuses).not.toContain('PAID');
            expect(statuses).not.toContain('CANCELLED');
        });

        it('invoice with zero outstanding filtered out after fetch (DB may still return it)', async () => {
            const asOf = new Date('2026-08-01T00:00:00Z');
            mockInvoiceFindMany.mockResolvedValue([
                // fully paid but status still PARTIAL transient — outstanding 0
                makeInvoice({ id: 'inv-zero', salesRepId: 'rep-1', totalAmount: 1000, paidAmount: 1000 }),
                makeInvoice({ id: 'inv-ok', salesRepId: 'rep-1', totalAmount: 1000, paidAmount: 0 }),
            ] as never);
            mockCsaFindMany.mockResolvedValue([] as never);
            mockUserFindMany.mockResolvedValue([]);
            const rows = await CollectionService.getInvoicesWithoutCollectionActivity({ asOf });
            expect(rows.map((r) => r.invoiceId)).toEqual(['inv-ok']);
        });

        it('filters by userId (scoping) — only that rep returned', async () => {
            const asOf = new Date('2026-08-01T00:00:00Z');
            mockInvoiceFindMany.mockResolvedValue([
                makeInvoice({ id: 'inv-1', salesRepId: 'rep-1', invoiceDate: new Date('2026-07-01'), dueDate: new Date('2026-07-10') }),
                makeInvoice({ id: 'inv-2', salesRepId: 'rep-2', invoiceDate: new Date('2026-07-02'), dueDate: new Date('2026-07-11') }),
            ] as never);
            mockCsaFindMany.mockResolvedValue([] as never);
            mockUserFindMany.mockResolvedValue([]);

            const rows = await CollectionService.getInvoicesWithoutCollectionActivity({ asOf, userId: 'rep-1' });
            expect(rows.length).toBe(1);
            expect(rows[0].invoiceId).toBe('inv-1');
        });

        it('fallback CustomerSalesAssignment applied for null salesRepId', async () => {
            const asOf = new Date('2026-08-01T00:00:00Z');
            mockInvoiceFindMany.mockResolvedValue([
                makeInvoice({ id: 'inv-fb', salesRepId: null, customerId: 'cust-1', invoiceDate: new Date('2026-07-01'), dueDate: new Date('2026-07-05') }),
            ] as never);
            mockCsaFindMany.mockResolvedValue([
                { customerId: 'cust-1', userId: 'rep-fb', isPrimary: true },
            ] as never);
            const rows = await CollectionService.getInvoicesWithoutCollectionActivity({ asOf });
            expect(rows.length).toBe(1);
            expect(rows[0].salesRepId).toBe('rep-fb');
        });

        it('returns sorted by daysOverdue desc (most overdue first)', async () => {
            const asOf = new Date('2026-08-01T00:00:00Z');
            const d = (daysAgo: number) => new Date(asOf.getTime() - daysAgo * 86400 * 1000);
            mockInvoiceFindMany.mockResolvedValue([
                makeInvoice({ id: 'inv-new', salesRepId: 'rep-1', invoiceDate: d(1), dueDate: d(1) }),
                makeInvoice({ id: 'inv-old', salesRepId: 'rep-1', invoiceDate: d(90), dueDate: d(90) }),
                makeInvoice({ id: 'inv-mid', salesRepId: 'rep-1', invoiceDate: d(30), dueDate: d(30) }),
            ] as never);
            mockCsaFindMany.mockResolvedValue([] as never);
            const rows = await CollectionService.getInvoicesWithoutCollectionActivity({ asOf });
            expect(rows.map((r) => r.invoiceId)).toEqual(['inv-old', 'inv-mid', 'inv-new']);
        });
    });

    // ── getOverduePromises ───────────────────────────────────────────

    describe('getOverduePromises', () => {
        it('only returns PROMISE_TO_PAY with promisedDate < asOf and invoice not PAID/CANCELLED', async () => {
            const asOf = new Date('2026-08-10T00:00:00Z');
            const pastPromise = {
                id: 'ca-1',
                type: 'PROMISE_TO_PAY',
                promisedDate: new Date('2026-08-05T00:00:00Z'),
                invoice: { id: 'inv-1', status: 'UNPAID' },
            };
            // Should be filtered by DB, but we verify query shape
            mockFindMany.mockResolvedValue([pastPromise] as never);

            const res = await CollectionService.getOverduePromises(asOf);

            expect(mockFindMany).toHaveBeenCalled();
            const arg = mockFindMany.mock.calls[0][0] as {
                where: {
                    type: string;
                    promisedDate: { lt: Date };
                    invoice: { status: { notIn: string[] } };
                };
                orderBy: { promisedDate: string };
                include: unknown;
            };

            expect(arg.where.type).toBe('PROMISE_TO_PAY');
            expect(arg.where.promisedDate.lt).toBe(asOf);
            expect(arg.where.invoice.status.notIn).toContain('PAID');
            expect(arg.where.invoice.status.notIn).toContain('CANCELLED');
            expect(arg.orderBy.promisedDate).toBe('asc');
            expect(res.length).toBe(1);
        });

        it('default asOf = now when not provided', async () => {
            mockFindMany.mockResolvedValue([] as never);
            const before = new Date();
            await CollectionService.getOverduePromises();
            const after = new Date();
            const arg = mockFindMany.mock.calls[0][0] as { where: { promisedDate: { lt: Date } } };
            const lt = arg.where.promisedDate.lt;
            expect(lt.getTime()).toBeGreaterThanOrEqual(before.getTime());
            expect(lt.getTime()).toBeLessThanOrEqual(after.getTime());
        });
    });
});
