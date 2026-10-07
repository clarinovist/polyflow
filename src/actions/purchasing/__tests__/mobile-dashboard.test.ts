import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { getPurchasingMobileOverview } from '../mobile-dashboard';
const m = vi.hoisted(() => ({ guard: vi.fn(), count: vi.fn(), orders: vi.fn(), ap: vi.fn() }));
vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/auth/purchasing-access', () => ({ requirePurchasingAccess: m.guard }));
vi.mock('@/lib/core/prisma', () => ({ prisma: {
    purchaseOrder: { count: m.count, findMany: m.orders },
    purchaseInvoice: { aggregate: m.ap, fields: { paidAmount: 'paid-field' } },
} }));
beforeEach(() => {
    vi.resetAllMocks(); m.guard.mockResolvedValue({}); m.count.mockResolvedValue(0); m.orders.mockResolvedValue([]);
    m.ap.mockResolvedValue({ _count: 0, _sum: { totalAmount: null, paidAmount: null } });
});
describe('purchasing mobile overview', () => {
    it('returns genuine empty data', async () => {
        expect(await getPurchasingMobileOverview()).toMatchObject({ success: true, data: { highlights: { overdueApAmount: 0 }, recentOrders: [] } });
    });
    it('uses full net AP aggregate including OVERDUE and does not pretend recent list is active total', async () => {
        m.ap.mockResolvedValue({ _count: 25, _sum: { totalAmount: new Prisma.Decimal(1000), paidAmount: new Prisma.Decimal(400) } });
        m.orders.mockResolvedValue([{ id: 'po', orderNumber: 'PO', supplier: { name: 'Synthetic' }, status: 'COMPLETED', totalAmount: null }]);
        expect(await getPurchasingMobileOverview()).toMatchObject({ success: true, data: { highlights: { overdueApCount: 25, overdueApAmount: 600 }, recentOrders: [{ totalAmount: null }] } });
        expect(m.ap.mock.calls[0][0].where.status.in).toContain('OVERDUE');
        expect(m.ap.mock.calls[0][0].where.totalAmount).toEqual({ gt: 'paid-field' });
    });
    it('returns failure for unavailable data', async () => {
        m.ap.mockRejectedValue(new Error('Synthetic unavailable')); expect(await getPurchasingMobileOverview()).toMatchObject({ success: false });
    });
    it('denies before reads', async () => {
        m.guard.mockRejectedValue(new Error('Denied')); expect(await getPurchasingMobileOverview()).toMatchObject({ success: false }); expect(m.count).not.toHaveBeenCalled();
    });
});
