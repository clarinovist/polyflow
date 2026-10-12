// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    board: vi.fn(),
    returns: vi.fn(),
}));
vi.mock('@/actions/dashboard/finance-dashboard', () => ({
    getFinanceShiftBoard: mocks.board,
}));
vi.mock('@/actions/finance/sales-returns', () => ({
    getFinanceSalesReturnSummary: mocks.returns,
}));
vi.mock('@/components/finance/finance-date-filter', () => ({
    FinanceDateFilter: () => <div>Filter tanggal</div>,
}));

import FinanceDashboardPage, { type FinanceDashboardData } from '../page';

function dashboardData(): FinanceDashboardData {
    const links = {
        receivedPayments: '/finance/payments/received',
        sentPayments: '/finance/payments/sent',
        pettyCash: '/finance/petty-cash',
        journals: '/finance/journals',
        salesInvoices: '/finance/invoices/sales',
        purchaseInvoices: '/finance/invoices/purchase',
        reconciliation: '/finance/bank-reconciliation',
        periods: '/finance/periods',
        returns: '/finance/returns',
        balanceSheet: '/finance/reports/balance-sheet',
        incomeStatement: '/finance/reports/income-statement',
    };
    return {
        generatedAt: '2026-04-15T08:00:00.000Z',
        state: 'AVAILABLE',
        period: {
            start: '2026-03-31T17:00:00.000Z',
            end: '2026-04-30T16:59:59.999Z',
            label: '01 Apr 2026 – 30 Apr 2026',
            asOfLabel: '30 Apr 2026',
        },
        permissions: { links },
        health: {
            cash: { state: 'AVAILABLE', value: 0 },
            revenue: { state: 'AVAILABLE', value: 1_000_000 },
            grossProfit: { state: 'AVAILABLE', value: 600_000 },
            netProfit: { state: 'AVAILABLE', value: 250_000 },
        },
        attention: {
            state: 'AVAILABLE',
            arOverdue: {
                total: 27,
                amount: 900_000,
                returned: 1,
                items: [
                    {
                        id: 'ar-1',
                        invoiceNumber: 'INV-AR-1',
                        customerName:
                            'Customer dengan nama panjang untuk wrapping aman',
                        remaining: 100_000,
                        dueDate: '2026-03-01T00:00:00.000Z',
                    },
                ],
            },
            arUnpaid: { total: 33, amount: 1_200_000 },
            apOverdue: {
                total: 8,
                amount: 600_000,
                returned: 1,
                items: [
                    {
                        id: 'ap-1',
                        invoiceNumber: 'PI-AP-1',
                        supplierName: 'Supplier A',
                        remaining: 200_000,
                        dueDate: '2026-03-02T00:00:00.000Z',
                    },
                ],
            },
            apUnpaid: { total: 12, amount: 900_000 },
            draftJournals: {
                total: 6,
                returned: 1,
                items: [
                    {
                        id: 'journal-1',
                        entryNumber: 'JE-001',
                        entryDate: '2026-04-10T00:00:00.000Z',
                        description: 'Draft journal',
                    },
                ],
            },
            openBankRecs: 2,
        },
        periodSignals: {
            openCount: 2,
            currentPeriod: {
                id: 'period-1',
                name: 'April 2026',
                endDate: '2026-04-30T00:00:00.000Z',
                status: 'OPEN',
            },
            daysToMonthEnd: 15,
            reconThisMonth: 1,
        },
        drivers: {
            state: 'AVAILABLE',
            revenue: Array.from({ length: 4 }, (_, index) => ({
                month: `2026-0${index + 1}`,
                value: (index + 1) * 100_000,
            })),
            netIncome: Array.from({ length: 4 }, (_, index) => ({
                month: `2026-0${index + 1}`,
                value: (index + 1) * 50_000,
            })),
        },
    };
}

describe('FinanceDashboardPage R4B', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.board.mockResolvedValue({
            success: true,
            data: dashboardData(),
        });
        mocks.returns.mockResolvedValue({
            success: true,
            data: {
                count: 0,
                draftCount: 0,
                confirmedCount: 0,
                receivedCount: 0,
                documentAmount: 0,
            },
        });
    });

    it('orders health before the priority queue and insight and renders exactly four condition signals', async () => {
        render(
            await FinanceDashboardPage({ searchParams: Promise.resolve({}) }),
        );

        const text = document.body.textContent ?? '';
        expect(text.indexOf('Ringkasan kesehatan')).toBeLessThan(
            text.indexOf('Prioritas Finance'),
        );
        expect(text.indexOf('Prioritas Finance')).toBeLessThan(
            text.indexOf('Insight ringkas'),
        );
        expect(screen.getByText('Posisi kas')).toBeTruthy();
        expect(screen.getByText('Pendapatan')).toBeTruthy();
        expect(screen.getByText('Laba kotor')).toBeTruthy();
        expect(screen.getByText('Laba bersih')).toBeTruthy();
        expect(screen.queryByText('AVAILABLE')).toBeNull();
        expect(screen.getAllByText('Rupiah')).toHaveLength(4);
        expect(screen.queryByText(/budget/i)).toBeNull();
        expect(screen.queryByText(/forecast/i)).toBeNull();
        expect(screen.queryByText(/margin/i)).toBeNull();
    });

    it('shows valid zero and always labels queue totals separately from returned samples', async () => {
        const data = dashboardData();
        if (data.state !== 'AVAILABLE' || !data.attention?.apOverdue)
            throw new Error('Expected available fixture');
        data.attention.apOverdue.total = 1;
        mocks.board.mockResolvedValue({ success: true, data });

        render(
            await FinanceDashboardPage({ searchParams: Promise.resolve({}) }),
        );

        expect(
            screen
                .getByText('Posisi kas')
                .closest('[data-slot="card"]')?.textContent,
        ).toMatch(/Rp.*0/);
        expect(screen.getByRole('link', { name: /Piutang27/ })).toBeTruthy();
        expect(screen.getByRole('link', { name: /Hutang1/ })).toBeTruthy();
        expect(screen.getByRole('link', { name: /Jurnal draf6/ })).toBeTruthy();
        expect(screen.getByText('36 total · 4 ditampilkan')).toBeTruthy();
        expect(
            screen.getByText(/Kondisi terkini, bukan filter periode/),
        ).toBeTruthy();
        expect(screen.getByRole('link', { name: /Terima bayar/ })).toBeTruthy();
        expect(screen.getByText('Filter tanggal')).toBeTruthy();
        expect(screen.getByRole('link', { name: /Buka retur/ })).toBeTruthy();
    });

    it.each([
        { openBankRecs: 1, returnCount: 0 },
        { openBankRecs: 0, returnCount: 2 },
    ])(
        'does not claim Attention all-clear with $openBankRecs open reconciliation and $returnCount return work',
        async ({ openBankRecs, returnCount }) => {
            const data = dashboardData();
            if (data.state !== 'AVAILABLE' || !data.attention)
                throw new Error('Expected available fixture');
            data.attention.arOverdue = {
                total: 0,
                amount: 0,
                returned: 0,
                items: [],
            };
            data.attention.apOverdue = {
                total: 0,
                amount: 0,
                returned: 0,
                items: [],
            };
            data.attention.draftJournals = {
                total: 0,
                returned: 0,
                items: [],
            };
            data.attention.openBankRecs = openBankRecs;
            mocks.board.mockResolvedValue({ success: true, data });
            mocks.returns.mockResolvedValue({
                success: true,
                data: {
                    count: returnCount,
                    draftCount: returnCount,
                    confirmedCount: 0,
                    receivedCount: 0,
                    documentAmount: returnCount > 0 ? 300 : 0,
                },
            });

            render(
                await FinanceDashboardPage({
                    searchParams: Promise.resolve({}),
                }),
            );

            expect(
                screen.queryByText(
                    'Tidak ada item Finance yang butuh perhatian.',
                ),
            ).toBeNull();
            if (openBankRecs > 0) {
                expect(screen.getByText('Rekonsiliasi bank terbuka')).toBeTruthy();
            }
            if (returnCount > 0) {
                expect(screen.getByText('Retur menunggu tindak lanjut')).toBeTruthy();
            }
        },
    );

    it('passes concrete date filters to the Finance board action', async () => {
        render(
            await FinanceDashboardPage({
                searchParams: Promise.resolve({
                    startDate: '2026-02-01T00:00:00.000Z',
                    endDate: '2026-02-28T00:00:00.000Z',
                }),
            }),
        );

        expect(mocks.board).toHaveBeenCalledWith({
            startDate: new Date('2026-02-01T00:00:00.000Z'),
            endDate: new Date('2026-02-28T00:00:00.000Z'),
        });
    });

    it('clamps legacy UTC end-of-month timestamps before they roll into November WIB', async () => {
        render(
            await FinanceDashboardPage({
                searchParams: Promise.resolve({
                    startDate: '2026-10-01T00:00:00.000Z',
                    endDate: '2026-10-31T23:59:59.999Z',
                }),
            }),
        );

        expect(mocks.board).toHaveBeenCalledWith({
            startDate: new Date('2026-10-01T00:00:00.000Z'),
            endDate: new Date('2026-10-31T16:59:59.999Z'),
        });
    });

    it('preserves an explicit date-only range that intentionally includes 1 November', async () => {
        render(
            await FinanceDashboardPage({
                searchParams: Promise.resolve({
                    startDate: '2026-10-01',
                    endDate: '2026-11-01',
                }),
            }),
        );

        expect(mocks.board).toHaveBeenCalledWith({
            startDate: new Date('2026-09-30T17:00:00.000Z'),
            endDate: new Date('2026-11-01T16:59:59.999Z'),
        });
    });

    it('preserves arbitrary ISO ranges that span into the next month', async () => {
        render(
            await FinanceDashboardPage({
                searchParams: Promise.resolve({
                    startDate: '2026-10-01T06:15:30.123Z',
                    endDate: '2026-11-01T05:30:45.456Z',
                }),
            }),
        );

        expect(mocks.board).toHaveBeenCalledWith({
            startDate: new Date('2026-10-01T06:15:30.123Z'),
            endDate: new Date('2026-11-01T05:30:45.456Z'),
        });
    });

    it('preserves a legitimate legacy-shaped Jakarta ISO range without clamping', async () => {
        render(
            await FinanceDashboardPage({
                searchParams: Promise.resolve({
                    startDate: '2026-09-30T17:00:00.000Z',
                    endDate: '2026-11-01T16:59:59.999Z',
                }),
            }),
        );

        expect(mocks.board).toHaveBeenCalledWith({
            startDate: new Date('2026-09-30T17:00:00.000Z'),
            endDate: new Date('2026-11-01T16:59:59.999Z'),
        });
    });

    it('parses date-only filter params as inclusive WIB business-day bounds', async () => {
        render(
            await FinanceDashboardPage({
                searchParams: Promise.resolve({
                    startDate: '2026-10-01',
                    endDate: '2026-10-31',
                }),
            }),
        );

        expect(mocks.board).toHaveBeenCalledWith({
            startDate: new Date('2026-09-30T17:00:00.000Z'),
            endDate: new Date('2026-10-31T16:59:59.999Z'),
        });
    });

    it('falls back to one canonical WIB month for incomplete or invalid filter pairs', async () => {
        render(
            await FinanceDashboardPage({
                searchParams: Promise.resolve({
                    startDate: '2026-10-01',
                    endDate: 'bad',
                }),
            }),
        );

        const range = mocks.board.mock.calls.at(-1)?.[0];
        expect(range.startDate).toBeInstanceOf(Date);
        expect(range.endDate).toBeInstanceOf(Date);
        expect(range.startDate.getTime()).toBeLessThan(range.endDate.getTime());
        expect(
            new Intl.DateTimeFormat('en-CA', {
                timeZone: 'Asia/Jakarta',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
            }).format(range.startDate),
        ).toMatch(/-01$/);
    });

    it('distinguishes NOT_CONFIGURED, UNAVAILABLE, and partial Attention from zero/empty', async () => {
        const data = dashboardData();
        if (data.state !== 'AVAILABLE' || !data.health || !data.attention)
            throw new Error('Expected available fixture');
        data.health.cash = { state: 'NOT_CONFIGURED', value: null };
        data.health.revenue = { state: 'UNAVAILABLE', value: null };
        data.attention.state = 'UNAVAILABLE';
        data.attention.apOverdue = null;
        data.periodSignals = null;
        mocks.board.mockResolvedValue({ success: true, data });

        render(
            await FinanceDashboardPage({ searchParams: Promise.resolve({}) }),
        );

        expect(screen.getAllByText('Belum disiapkan').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Data tidak tersedia').length).toBeGreaterThan(0);
        expect(screen.getByText('Sebagian antrean Finance tidak tersedia')).toBeTruthy();
        expect(
            screen.getByRole('link', { name: /INV-AR-1.*Tinjau piutang/ }),
        ).toBeTruthy();
        expect(screen.getByText('Sinyal periode tidak tersedia')).toBeTruthy();
        expect(screen.getByText('3 prioritas ditampilkan')).toBeTruthy();
        expect(screen.queryByText(/35 total/)).toBeNull();
    });

    it('does not treat a failed return reader as an empty queue', async () => {
        const data = dashboardData();
        if (data.state !== 'AVAILABLE' || !data.attention)
            throw new Error('Expected available fixture');
        data.attention.arOverdue = {
            total: 0,
            amount: 0,
            returned: 0,
            items: [],
        };
        data.attention.apOverdue = {
            total: 0,
            amount: 0,
            returned: 0,
            items: [],
        };
        data.attention.draftJournals = {
            total: 0,
            returned: 0,
            items: [],
        };
        data.attention.openBankRecs = 0;
        mocks.board.mockResolvedValue({ success: true, data });
        mocks.returns.mockResolvedValue({ success: false, error: 'denied' });

        render(
            await FinanceDashboardPage({ searchParams: Promise.resolve({}) }),
        );

        expect(
            screen.getByText('Antrean retur penjualan tidak tersedia'),
        ).toBeTruthy();
        expect(
            screen.queryByText('Tidak ada item Finance yang butuh perhatian.'),
        ).toBeNull();
    });

    it('gates Drivers below four points and keeps permission-filtered links absent', async () => {
        const data = dashboardData();
        if (data.state !== 'AVAILABLE' || !data.permissions || !data.drivers)
            throw new Error('Expected available fixture');
        data.drivers = { state: 'NOT_CONFIGURED', revenue: [], netIncome: [] };
        data.permissions.links.balanceSheet = null;
        data.permissions.links.returns = null;
        mocks.board.mockResolvedValue({ success: true, data });

        render(
            await FinanceDashboardPage({ searchParams: Promise.resolve({}) }),
        );

        expect(screen.getByText('Riwayat belum cukup')).toBeTruthy();
        expect(screen.queryByText('Pendapatan bulanan')).toBeNull();
        expect(screen.getByText('Posisi kas').closest('a')).toBeNull();
        expect(screen.queryByRole('link', { name: /Buka retur/ })).toBeNull();
        expect(mocks.returns).not.toHaveBeenCalled();
    });

    it('renders total action failure without fabricated metrics or secondary nominal queries', async () => {
        mocks.board.mockResolvedValue({ success: false, error: 'unavailable' });

        render(
            await FinanceDashboardPage({ searchParams: Promise.resolve({}) }),
        );

        expect(screen.getByText('Dashboard Finance tidak tersedia')).toBeTruthy();
        expect(screen.queryByText('Rp 0')).toBeNull();
        expect(mocks.returns).not.toHaveBeenCalled();
    });
});
