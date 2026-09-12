// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getFinanceSalesInvoicePage, dateFilter } = vi.hoisted(() => ({
    getFinanceSalesInvoicePage: vi.fn(),
    dateFilter: vi.fn(),
}));

vi.mock('@/actions/finance/invoice', () => ({
    getFinanceSalesInvoicePage,
}));
vi.mock('@/components/sales/InvoiceTable', () => ({
    InvoiceTable: (props: {
        pagination?: { page: number; pageSize: number; total: number };
        serverSorting?: { sort: string; direction: string };
    }) => (
        <output data-testid="invoice-table">{JSON.stringify(props)}</output>
    ),
}));
vi.mock('@/components/common/url-transaction-date-filter', () => ({
    UrlTransactionDateFilter: (props: unknown) => {
        dateFilter(props);
        return <div>Filter tanggal</div>;
    },
}));
vi.mock('@/components/support/contextual-help', () => ({
    ContextualHelp: () => <div>Panduan</div>,
}));

import InvoicesPage from '../page';

describe('finance sales invoice page', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('uses URL page and pageSize for the dedicated paged query', async () => {
        getFinanceSalesInvoicePage.mockResolvedValue({
            success: true,
            data: {
                data: [],
                meta: { page: 3, pageSize: 100, total: 205, totalPages: 3 },
            },
        });

        render(
            await InvoicesPage({
                searchParams: Promise.resolve({
                    demand: 'customer',
                    page: '3',
                    pageSize: '100',
                    search: 'INV-42',
                    status: 'UNPAID',
                    sort: 'totalAmount',
                    direction: 'asc',
                }),
            }),
        );

        expect(getFinanceSalesInvoicePage).toHaveBeenCalledWith(
            expect.objectContaining({
                page: 3,
                pageSize: 100,
                search: 'INV-42',
                demandType: 'customer',
                status: 'UNPAID',
                sort: 'totalAmount',
                direction: 'asc',
            }),
        );
        expect(screen.getByTestId('invoice-table').textContent).toContain(
            '"pageSize":100',
        );
        expect(screen.getByTestId('invoice-table').textContent).toContain(
            '"serverSorting":{"sort":"totalAmount","direction":"asc"}',
        );
        expect(dateFilter).toHaveBeenCalledWith(
            expect.objectContaining({ presetTimeZone: 'Asia/Jakarta' }),
        );
    });

    it.each([
        [{ startDate: 'bad', endDate: '2026-09-12' }],
        [{ startDate: '2026-09-01' }],
        [{ startDate: '2026-09-12', endDate: '2026-09-01' }],
    ])('ignores malformed, incomplete, or reversed date pairs before Prisma', async (dateParams) => {
        getFinanceSalesInvoicePage.mockResolvedValue({
            success: true,
            data: {
                data: [],
                meta: { page: 1, pageSize: 50, total: 0, totalPages: 0 },
            },
        });

        render(
            await InvoicesPage({
                searchParams: Promise.resolve(dateParams),
            }),
        );

        expect(getFinanceSalesInvoicePage).toHaveBeenCalledWith(
            expect.objectContaining({
                startDate: undefined,
                endDate: undefined,
            }),
        );
    });

    it('converts valid date-only pairs to inclusive WIB boundaries', async () => {
        getFinanceSalesInvoicePage.mockResolvedValue({
            success: true,
            data: {
                data: [],
                meta: { page: 1, pageSize: 50, total: 0, totalPages: 0 },
            },
        });

        render(
            await InvoicesPage({
                searchParams: Promise.resolve({
                    startDate: '2026-09-01',
                    endDate: '2026-09-12',
                }),
            }),
        );

        expect(getFinanceSalesInvoicePage).toHaveBeenCalledWith(
            expect.objectContaining({
                startDate: new Date('2026-08-31T17:00:00.000Z'),
                endDate: new Date('2026-09-12T16:59:59.999Z'),
            }),
        );
    });

    it('throws an explicit route error when the invoice action fails', async () => {
        getFinanceSalesInvoicePage.mockResolvedValue({
            success: false,
            error: 'Database invoice tidak tersedia',
        });

        await expect(
            InvoicesPage({ searchParams: Promise.resolve({}) }),
        ).rejects.toThrow('Database invoice tidak tersedia');
    });
});
