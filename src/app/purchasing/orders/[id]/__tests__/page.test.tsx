// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { auth, getPurchaseOrderById, detailClient } = vi.hoisted(() => ({
    auth: vi.fn(),
    getPurchaseOrderById: vi.fn(),
    detailClient: vi.fn(),
}));

vi.mock('@/auth', () => ({ auth }));
vi.mock('@/lib/core/tenant', () => ({ withTenantPage: (fn: unknown) => fn }));
vi.mock('@/services/purchasing/purchase-service', () => ({
    PurchaseService: { getPurchaseOrderById },
}));
vi.mock('@/components/purchasing/orders/PurchaseOrderDetailClient', () => ({
    PurchaseOrderDetailClient: (props: unknown) => {
        detailClient(props);
        return <div data-testid="po-detail" />;
    },
}));

import PurchaseOrderDetailPage from '../page';

const order = {
    id: 'po-1',
    orderNumber: 'PO-001',
    status: 'SENT',
    orderDate: new Date('2026-11-01T00:00:00Z'),
    expectedDate: null,
    deliveryAddress: null,
    notes: null,
    createdAt: new Date('2026-11-01T00:00:00Z'),
    updatedAt: new Date('2026-11-01T00:00:00Z'),
    createdBy: { name: 'Admin' },
    totalAmount: 1_500_000,
    discountAmount: 0,
    taxAmount: 165_000,
    shippingCost: 0,
    supplier: { id: 's-1', name: 'Supplier A', code: 'SUP', paymentTermDays: 30 },
    items: [
        {
            id: 'i-1',
            productVariantId: 'v-1',
            quantity: 10,
            receivedQty: 0,
            unitPrice: 150_000,
            subtotal: 1_500_000,
            dppOtherAmount: null,
            taxPercent: 11,
            taxAmount: 165_000,
            discountPercent: 0,
            productVariant: {
                id: 'v-1',
                name: 'Resin',
                skuCode: 'RSN-1',
                primaryUnit: 'KG',
            },
        },
    ],
    goodsReceipts: [],
    invoices: [{ id: 'inv-1', invoiceNumber: 'INV-1', totalAmount: 1_500_000 }],
};

const renderPage = async () =>
    render(await PurchaseOrderDetailPage({ params: Promise.resolve({ id: 'po-1' }) }));
const lastProps = () => detailClient.mock.calls.at(-1)![0] as {
    order: { totalAmount: number | null; items: Array<{ unitPrice: number }>; invoices: unknown[] };
    warehouseMode?: boolean;
    canCreateReceipt?: boolean;
    basePath?: string;
};

beforeEach(() => {
    vi.clearAllMocks();
    getPurchaseOrderById.mockResolvedValue(order);
});

describe('purchase order detail route price visibility', () => {
    it('sends redacted data and read-only mode for Kepala Pabrik without ADMIN', async () => {
        auth.mockResolvedValue({
            user: { role: 'FACTORY_MANAGER', roles: ['FACTORY_MANAGER'] },
        });

        await renderPage();

        const props = lastProps();
        expect(props.warehouseMode).toBe(true);
        expect(props.canCreateReceipt).toBe(false);
        expect(props.basePath).toBeUndefined();
        expect(props.order.totalAmount).toBeNull();
        expect(props.order.items[0].unitPrice).toBe(0);
        expect(props.order.invoices).toEqual([]);
        expect(JSON.stringify(props.order)).not.toContain('1500000');
        expect(JSON.stringify(props.order)).not.toContain('150000');
    });

    it.each([
        ['ADMIN', ['ADMIN']],
        ['PROCUREMENT', ['PROCUREMENT']],
        ['PLANNING', ['PLANNING']],
        ['FACTORY_MANAGER with ADMIN', ['FACTORY_MANAGER', 'ADMIN']],
    ])('keeps prices for %s', async (_label, roles) => {
        auth.mockResolvedValue({ user: { role: roles[0], roles } });

        await renderPage();

        const props = lastProps();
        expect(props.warehouseMode).toBeFalsy();
        expect(props.canCreateReceipt).toBe(true);
        expect(props.order.totalAmount).toBe(1_500_000);
        expect(props.order.items[0].unitPrice).toBe(150_000);
        expect(props.order.invoices).toHaveLength(1);
    });
});
