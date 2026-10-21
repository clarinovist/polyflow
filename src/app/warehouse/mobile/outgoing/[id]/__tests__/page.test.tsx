import { beforeEach, describe, expect, it, vi } from 'vitest';
import Page from '../page';
const m = vi.hoisted(() => ({
    delivery: vi.fn(),
    attachments: vi.fn(),
    auth: vi.fn(),
    sales: vi.fn(),
}));
vi.mock('@/auth', () => ({ auth: m.auth }));
vi.mock('@/actions/inventory/deliveries', () => ({
    getDeliveryOrderById: m.delivery,
}));
vi.mock('@/actions/warehouse/operational-attachments', () => ({
    listWarehouseAttachments: m.attachments,
}));
vi.mock('@/actions/sales/sales', () => ({ getSalesOrderById: m.sales }));
vi.mock('../WarehouseOutgoingDetailClient', () => ({
    WarehouseOutgoingDetailClient: () => null,
}));
vi.mock('next/navigation', () => ({
    notFound: () => {
        throw new Error('404');
    },
    redirect: (path: string) => {
        throw new Error(`redirect:${path}`);
    },
}));
const order = () => ({
    id: 'do',
    orderNumber: 'SJ-TEST',
    status: 'LOADING',
    loadVerifiedAt: null,
    salesOrder: {
        items: [{ productVariantId: 'v', quantity: 200, deliveredQty: 25 }],
    },
    items: [
        {
            id: 'line',
            productVariantId: 'v',
            quantity: 125,
            verifiedQuantity: 125,
            enteredQuantity: 5,
            enteredUnit: 'BAL',
            conversionFactorSnapshot: 25,
        },
    ],
});
beforeEach(() => {
    vi.resetAllMocks();
    m.delivery.mockResolvedValue({ success: true, data: order() });
    m.attachments.mockResolvedValue({ success: true, data: [] });
});
const page = () => Page({ params: Promise.resolve({ id: 'do' }) });
describe('mobile delivery page capabilities and refresh identity', () => {
    it.each([
        [{ role: 'WAREHOUSE' }, false],
        [{ role: 'ADMIN' }, true],
        [{ role: 'SALES' }, true],
        [{ role: 'MARKETING' }, true],
        [{ role: 'WAREHOUSE', roles: ['WAREHOUSE', 'SALES'] }, true],
        [null, false],
    ])(
        'derives revision capability from server session %j',
        async (user, expected) => {
            m.auth.mockResolvedValue(user ? { user } : null);
            const result = await page();
            expect(result.props.canReviseOrder).toBe(expected);
            expect(result.props.order.salesOrder.items[0]).toEqual({
                productVariantId: 'v',
                quantity: 200,
                deliveredQty: 25,
            });
        },
    );
    it('remounts after lock/status/unit changes even when quantity stays identical', async () => {
        const original = await page();
        for (const patch of [
            { updatedAt: '2026-10-21T12:00:00Z' },
            { loadVerifiedAt: '2026-10-21' },
            { status: 'SHIPPED' },
            { items: [{ ...order().items[0], conversionFactorSnapshot: 20 }] },
        ]) {
            m.delivery.mockResolvedValue({
                success: true,
                data: { ...order(), ...patch },
            });
            expect((await page()).key).not.toBe(original.key);
        }
    });
    it('preserves legacy Sales Order fallback and ignores failed optional attachments', async () => {
        m.attachments.mockResolvedValue({ success: false });
        expect((await page()).props.attachments).toEqual([]);
        m.delivery.mockResolvedValue({ success: false });
        m.sales.mockResolvedValue({ success: true, data: { id: 'do' } });
        await expect(page()).rejects.toThrow('redirect:/field/sales/orders/do');
        m.sales.mockResolvedValue({ success: false });
        await expect(page()).rejects.toThrow('404');
    });
});
