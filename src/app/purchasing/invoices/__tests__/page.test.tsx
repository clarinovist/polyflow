// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getPurchaseInvoicesPage: vi.fn(),
    purchaseInvoiceTable: vi.fn(),
    remittanceEntry: vi.fn(),
    dateFilter: vi.fn(),
    outstanding: vi.fn(),
    remittances: vi.fn(),
    paymentBanks: vi.fn(),
    canCreate: vi.fn(),
}));
const { getPurchaseInvoicesPage, purchaseInvoiceTable, dateFilter } = mocks;

vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/services/purchasing/purchase-service', () => ({
    PurchaseService: { getPurchaseInvoicesPage: mocks.getPurchaseInvoicesPage },
}));
vi.mock('@/components/purchasing/orders/PurchaseInvoiceTable', () => ({
    PurchaseInvoiceTable: (props: unknown) => {
        purchaseInvoiceTable(props);
        return <div data-testid="purchase-invoice-table" />;
    },
}));
vi.mock('@/components/purchasing/PurchaseRemittanceEntryPoint', () => ({
    PurchaseRemittanceEntryPoint: (props: unknown) => {
        mocks.remittanceEntry(props);
        return <div data-testid="remittance-entry" />;
    },
}));
vi.mock('@/components/common/url-transaction-date-filter', () => ({
    UrlTransactionDateFilter: (props: unknown) => {
        dateFilter(props);
        return null;
    },
}));
vi.mock('@/actions/purchasing/purchase-remittance', () => ({
    listOutstandingPurchaseInvoicesAction: mocks.outstanding,
    listPurchaseRemittancesAction: mocks.remittances,
}));
vi.mock('@/actions/finance/payment-banks-actions', () => ({
    getPaymentBanks: mocks.paymentBanks,
}));
vi.mock('@/lib/auth/purchasing-access', () => ({
    canCreatePurchaseRemittance: mocks.canCreate,
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
    mocks.outstanding.mockResolvedValue({ success: true, data: [] });
    mocks.remittances.mockResolvedValue({ success: true, data: [] });
    mocks.paymentBanks.mockResolvedValue({ success: true, data: [] });
    mocks.canCreate.mockResolvedValue(true);
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

    it('keeps the main list usable and marks every auxiliary failure honestly', async () => {
        mocks.outstanding.mockRejectedValueOnce(new Error('down'));
        mocks.remittances.mockResolvedValueOnce({
            success: false,
            error: 'remittance down',
        });
        mocks.paymentBanks.mockResolvedValueOnce({
            success: false,
            error: 'bank down',
        });

        render(
            await PurchasingInvoicesPage({
                searchParams: Promise.resolve({}),
            }),
        );

        expect(purchaseInvoiceTable).toHaveBeenCalled();
        expect(mocks.remittanceEntry).toHaveBeenCalledWith(
            expect.objectContaining({
                invoices: [],
                paymentBanks: [],
                initialRemittances: [],
                canCreate: true,
                auxiliaryState: {
                    outstanding: 'error',
                    remittances: 'error',
                    paymentBanks: 'error',
                },
            }),
        );
    });

    it('distinguishes missing bank configuration from an operational error', async () => {
        render(
            await PurchasingInvoicesPage({
                searchParams: Promise.resolve({}),
            }),
        );
        expect(mocks.remittanceEntry).toHaveBeenCalledWith(
            expect.objectContaining({
                auxiliaryState: expect.objectContaining({
                    paymentBanks: 'missing',
                    outstanding: 'empty',
                    remittances: 'empty',
                }),
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
