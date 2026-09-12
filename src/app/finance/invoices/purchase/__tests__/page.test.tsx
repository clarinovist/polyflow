// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getPurchaseInvoicesPage, purchaseInvoiceTable, dateFilter } = vi.hoisted(
    () => ({
        getPurchaseInvoicesPage: vi.fn(),
        purchaseInvoiceTable: vi.fn(),
        dateFilter: vi.fn(),
    }),
);

vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/services/purchasing/purchase-service', () => ({
    PurchaseService: { getPurchaseInvoicesPage },
}));
vi.mock('@/components/purchasing/orders/PurchaseInvoiceTable', () => ({
    PurchaseInvoiceTable: (props: unknown) => {
        purchaseInvoiceTable(props);
        return <div data-testid="purchase-invoice-table" />;
    },
}));
vi.mock('@/components/common/url-transaction-date-filter', () => ({
    UrlTransactionDateFilter: (props: unknown) => {
        dateFilter(props);
        return null;
    },
}));

import PurchaseInvoicesPage from '../page';

beforeEach(() => {
    vi.clearAllMocks();
    getPurchaseInvoicesPage.mockResolvedValue({
        items: [],
        page: 2,
        pageSize: 50,
        totalCount: 51,
        totalPages: 2,
    });
});

describe('finance purchase invoices route', () => {
    it('passes validated URL state and inclusive WIB date bounds to the paged service', async () => {
        render(
            await PurchaseInvoicesPage({
                searchParams: Promise.resolve({
                    page: '2',
                    pageSize: '50',
                    search: 'BILL-42',
                    status: 'UNPAID',
                    startDate: '2026-09-01',
                    endDate: '2026-09-12',
                    sort: 'totalAmount',
                    direction: 'asc',
                }),
            }),
        );

        expect(getPurchaseInvoicesPage).toHaveBeenCalledWith({
            page: 2,
            pageSize: 50,
            search: 'BILL-42',
            status: 'UNPAID',
            overdue: false,
            startDate: new Date('2026-08-31T17:00:00.000Z'),
            endDate: new Date('2026-09-12T16:59:59.999Z'),
            sort: 'totalAmount',
            direction: 'asc',
        });
        expect(purchaseInvoiceTable).toHaveBeenCalledWith(
            expect.objectContaining({
                pagination: {
                    page: 2,
                    pageSize: 50,
                    totalCount: 51,
                    totalPages: 2,
                },
                sort: 'totalAmount',
                direction: 'asc',
            }),
        );
        expect(dateFilter).toHaveBeenCalledWith(
            expect.objectContaining({ presetTimeZone: 'Asia/Jakarta' }),
        );
    });

    it('passes ISO boundaries emitted by the WIB URL filter without shifting them', async () => {
        render(
            await PurchaseInvoicesPage({
                searchParams: Promise.resolve({
                    startDate: '2026-08-31T17:00:00.000Z',
                    endDate: '2026-09-12T16:59:59.999Z',
                }),
            }),
        );

        expect(getPurchaseInvoicesPage).toHaveBeenCalledWith(
            expect.objectContaining({
                startDate: new Date('2026-08-31T17:00:00.000Z'),
                endDate: new Date('2026-09-12T16:59:59.999Z'),
            }),
        );
    });

    it('ignores malformed dates and treats OVERDUE as the overdue contract', async () => {
        render(
            await PurchaseInvoicesPage({
                searchParams: Promise.resolve({
                    status: 'OVERDUE',
                    startDate: '2026-02-30',
                    endDate: 'bad',
                    sort: 'invalid',
                    direction: 'invalid',
                }),
            }),
        );

        expect(getPurchaseInvoicesPage).toHaveBeenCalledWith({
            page: undefined,
            pageSize: undefined,
            search: undefined,
            status: undefined,
            overdue: true,
            sort: 'invoiceDate',
            direction: 'desc',
        });
    });
});
