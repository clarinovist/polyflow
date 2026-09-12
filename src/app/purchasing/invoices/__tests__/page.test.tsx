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
vi.mock('@/components/purchasing/PurchaseRemittanceEntryPoint', () => ({
    PurchaseRemittanceEntryPoint: () => null,
}));
vi.mock('@/components/common/url-transaction-date-filter', () => ({
    UrlTransactionDateFilter: (props: unknown) => {
        dateFilter(props);
        return null;
    },
}));
vi.mock('@/actions/purchasing/purchase-remittance', () => ({
    listOutstandingPurchaseInvoicesAction: vi.fn().mockResolvedValue(null),
    listPurchaseRemittancesAction: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/actions/finance/payment-banks-actions', () => ({
    getPaymentBanks: vi.fn().mockResolvedValue(null),
}));

import PurchasingInvoicesPage from '../page';

beforeEach(() => {
    vi.clearAllMocks();
    getPurchaseInvoicesPage.mockResolvedValue({
        items: [],
        page: 1,
        pageSize: 50,
        totalCount: 0,
        totalPages: 0,
    });
});

describe('purchasing invoices route', () => {
    it('uses the same paged filtering contract with inclusive WIB dates', async () => {
        render(
            await PurchasingInvoicesPage({
                searchParams: Promise.resolve({
                    page: '4',
                    pageSize: '100',
                    search: 'supplier',
                    status: 'PARTIAL',
                    startDate: '2026-09-01',
                    endDate: '2026-09-12',
                    sort: 'dueDate',
                    direction: 'asc',
                }),
            }),
        );

        expect(getPurchaseInvoicesPage).toHaveBeenCalledWith({
            page: 4,
            pageSize: 100,
            search: 'supplier',
            status: 'PARTIAL',
            overdue: false,
            startDate: new Date('2026-08-31T17:00:00.000Z'),
            endDate: new Date('2026-09-12T16:59:59.999Z'),
            sort: 'dueDate',
            direction: 'asc',
        });
        expect(purchaseInvoiceTable).toHaveBeenCalledWith(
            expect.objectContaining({
                basePath: '/purchasing/invoices',
                sort: 'dueDate',
                direction: 'asc',
            }),
        );
        expect(dateFilter).toHaveBeenCalledWith(
            expect.objectContaining({ presetTimeZone: 'Asia/Jakarta' }),
        );
    });

    it('passes ISO boundaries emitted by the WIB URL filter without shifting them', async () => {
        render(
            await PurchasingInvoicesPage({
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

    it('ignores invalid date-only and pagination values', async () => {
        render(
            await PurchasingInvoicesPage({
                searchParams: Promise.resolve({
                    page: '1.5',
                    pageSize: '0',
                    startDate: 'invalid',
                    endDate: '2026-04-31',
                    sort: 'drop-table',
                    direction: 'up',
                }),
            }),
        );

        expect(getPurchaseInvoicesPage).toHaveBeenCalledWith({
            page: undefined,
            pageSize: undefined,
            search: undefined,
            status: undefined,
            overdue: false,
            sort: 'invoiceDate',
            direction: 'desc',
        });
    });
});
