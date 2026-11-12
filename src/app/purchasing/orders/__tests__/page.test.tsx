// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { auth, getPurchaseOrdersPage, purchaseOrderTable } = vi.hoisted(() => ({
    auth: vi.fn(),
    getPurchaseOrdersPage: vi.fn(),
    purchaseOrderTable: vi.fn(),
}));

vi.mock('@/auth', () => ({ auth }));

vi.mock('@/lib/core/tenant', () => ({
    withTenantPage: (fn: unknown) => fn,
}));
vi.mock('@/services/purchasing/purchase-service', () => ({
    PurchaseService: { getPurchaseOrdersPage },
}));
vi.mock('@/components/purchasing/orders/PurchaseOrderTable', () => ({
    PurchaseOrderTable: (props: unknown) => {
        purchaseOrderTable(props);
        return <div data-testid="purchase-order-table" />;
    },
}));

import PurchaseOrdersPage from '../page';

beforeEach(() => {
    vi.clearAllMocks();
    auth.mockResolvedValue({
        user: { role: 'PROCUREMENT', roles: ['PROCUREMENT'] },
    });
    getPurchaseOrdersPage.mockResolvedValue({
        items: [],
        page: 1,
        pageSize: 50,
        totalCount: 0,
        totalPages: 0,
    });
});

describe('purchase orders route', () => {
    it('parses pagination and date-only filters as inclusive WIB bounds', async () => {
        render(
            await PurchaseOrdersPage({
                searchParams: Promise.resolve({
                    page: '3',
                    pageSize: '100',
                    search: 'PO-42',
                    status: 'SENT',
                    startDate: '2026-09-01',
                    endDate: '2026-09-12',
                    sort: 'supplier',
                    direction: 'asc',
                }),
            }),
        );

        expect(getPurchaseOrdersPage).toHaveBeenCalledWith({
            page: 3,
            pageSize: 100,
            search: 'PO-42',
            status: 'SENT',
            startDate: new Date('2026-08-31T17:00:00.000Z'),
            endDate: new Date('2026-09-12T16:59:59.999Z'),
            sort: 'supplier',
            direction: 'asc',
        });
    });

    it('ignores invalid date and pagination values instead of passing invalid dates', async () => {
        render(
            await PurchaseOrdersPage({
                searchParams: Promise.resolve({
                    page: '-1',
                    pageSize: 'NaN',
                    startDate: '2026-02-30',
                    endDate: 'not-a-date',
                    sort: 'unsafe',
                    direction: 'sideways',
                }),
            }),
        );

        expect(getPurchaseOrdersPage).toHaveBeenCalledWith({
            page: undefined,
            pageSize: undefined,
            search: undefined,
            status: undefined,
            sort: 'orderDate',
            direction: 'desc',
        });
        expect(purchaseOrderTable).toHaveBeenCalledWith(
            expect.objectContaining({
                initialStartDate: undefined,
                initialEndDate: undefined,
            }),
        );
    });
});

describe('purchase orders route price visibility', () => {
    const pricedOrder = {
        id: 'po-1',
        orderNumber: 'PO-001',
        totalAmount: 1_500_000,
        supplier: { name: 'Supplier A', code: null },
        _count: { items: 3 },
    };
    const tableProps = () =>
        purchaseOrderTable.mock.calls.at(-1)![0] as {
            orders: Array<{ totalAmount: number | null }>;
            hidePrices?: boolean;
            canCreate?: boolean;
            sort: string;
        };

    beforeEach(() => {
        getPurchaseOrdersPage.mockResolvedValue({
            items: [pricedOrder],
            page: 1,
            pageSize: 50,
            totalCount: 1,
            totalPages: 1,
        });
    });

    it('strips totals from the client payload for Kepala Pabrik without ADMIN', async () => {
        auth.mockResolvedValue({
            user: { role: 'FACTORY_MANAGER', roles: ['FACTORY_MANAGER'] },
        });

        render(await PurchaseOrdersPage({ searchParams: Promise.resolve({}) }));

        expect(tableProps().hidePrices).toBe(true);
        expect(tableProps().canCreate).toBe(false);
        expect(screen.queryByRole('link', { name: /Buat PO/ })).toBeNull();
        expect(tableProps().orders[0].totalAmount).toBeNull();
        expect(JSON.stringify(tableProps().orders)).not.toContain('1500000');
    });

    it('does not let Kepala Pabrik rank orders by hidden totals', async () => {
        auth.mockResolvedValue({
            user: { role: 'FACTORY_MANAGER', roles: ['FACTORY_MANAGER'] },
        });

        render(
            await PurchaseOrdersPage({
                searchParams: Promise.resolve({ sort: 'totalAmount', direction: 'desc' }),
            }),
        );

        expect(getPurchaseOrdersPage).toHaveBeenCalledWith(
            expect.objectContaining({ sort: 'orderDate' }),
        );
        expect(tableProps().sort).toBe('orderDate');
    });

    it.each([
        ['PROCUREMENT', ['PROCUREMENT']],
        ['PLANNING', ['PLANNING']],
        ['ADMIN', ['ADMIN']],
        ['FACTORY_MANAGER with ADMIN', ['FACTORY_MANAGER', 'ADMIN']],
    ])('keeps totals and sorting for %s', async (_label, roles) => {
        auth.mockResolvedValue({ user: { role: roles[0], roles } });

        render(
            await PurchaseOrdersPage({
                searchParams: Promise.resolve({ sort: 'totalAmount' }),
            }),
        );

        expect(tableProps().hidePrices).toBeFalsy();
        expect(tableProps().canCreate).toBe(true);
        expect(screen.getByRole('link', { name: /Buat PO/ })).toBeTruthy();
        expect(tableProps().orders[0].totalAmount).toBe(1_500_000);
        expect(getPurchaseOrdersPage).toHaveBeenCalledWith(
            expect.objectContaining({ sort: 'totalAmount' }),
        );
    });
});
