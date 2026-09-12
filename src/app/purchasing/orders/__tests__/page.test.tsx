// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getPurchaseOrdersPage, purchaseOrderTable } = vi.hoisted(() => ({
    getPurchaseOrdersPage: vi.fn(),
    purchaseOrderTable: vi.fn(),
}));

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
