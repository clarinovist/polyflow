// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getSalesDashboardStats: vi.fn() }));
vi.mock('@/actions/dashboard/sales-dashboard', () => ({
    getSalesDashboardStats: mocks.getSalesDashboardStats,
}));

import SalesCommandBoardPage, {
    type SalesDashboardData,
} from '../page';

function dashboardData(): SalesDashboardData {
    return {
        generatedAt: '2026-10-09T08:00:00.000Z',
        state: 'AVAILABLE' as const,
        scope: {
            kind: 'COMPANY' as const,
            label: 'Seluruh perusahaan',
            operationalLabel: 'Seluruh perusahaan',
        },
        period: {
            start: '2026-09-30T17:00:00.000Z',
            end: '2026-10-09T16:59:59.999Z',
            label: '01 Okt 2026 – 09 Okt 2026',
        },
        permissions: {
            canViewNominal: true,
            links: {
                orders: '/sales/orders',
                performance: '/sales/reports/sales-performance',
                visits: '/sales/visits',
                pipeline: '/sales/pipeline',
                invoices: '/sales/invoices',
                deliveries: '/sales/deliveries',
                deliverySchedules: '/sales/delivery-schedules',
                customers: '/sales/customers',
                fieldSales: '/field/sales',
            },
        },
        health: {
            revenue: {
                state: 'AVAILABLE' as const,
                value: 1_000_000,
                targetState: 'NOT_CONFIGURED' as const,
            },
            orders: { state: 'AVAILABLE' as const, value: 12 },
            visits: { state: 'AVAILABLE' as const, value: 8 },
            pipeline: {
                state: 'AVAILABLE' as const,
                count: 5,
                value: 750_000,
            },
        },
        attention: {
            state: 'AVAILABLE' as const,
            counts: {
                draftOrders: 3,
                readyToShipOrders: 2,
                readyWithoutDo: 27,
                openDeliveryOrders: 1,
                tripsToday: 1,
                overdueInvoices: 1,
                overdueAmount: 100_000,
                activeOrders: 5,
                activeCustomers: 6,
            },
            oldDrafts: {
                total: 3,
                returned: 1,
                items: [
                    {
                        id: 'draft-1',
                        orderNumber: 'SO-DRAFT-1',
                        customerName: 'Customer panjang untuk membuktikan wrapping aman',
                        daysOld: 5,
                    },
                ],
            },
            readyWithoutDo: {
                total: 27,
                returned: 1,
                items: [
                    { id: 'ready-21', orderNumber: 'SO-READY-21', customerName: 'Customer A' },
                ],
            },
            openDeliveries: {
                total: 1,
                returned: 1,
                items: [
                    { id: 'do-1', deliveryNumber: 'SJ-001', status: 'LOADING', customerName: 'Customer B' },
                ],
            },
            overdueInvoices: {
                total: 1,
                returned: 1,
                items: [
                    { id: 'inv-1', invoiceNumber: 'INV-001', customerName: 'Customer C', remaining: 100_000, dueDate: '2026-09-01T00:00:00.000Z', salesOrderId: 'so-1' },
                ],
            },
            creditRisk: {
                total: 8,
                returned: 1,
                items: [
                    { id: 'customer-1', name: 'Customer Risk', exposureStatus: 'over' as const, headroom: -50_000 },
                ],
            },
            followUpsDue: {
                total: 2,
                returned: 1,
                items: [
                    { id: 'quotation-1', orderNumber: 'QUO-001', customerName: 'Customer D', nextFollowUpDate: '2026-10-08T00:00:00.000Z', isOverdue: true },
                ],
            },
        },
        drivers: {
            revenueTrend: {
                state: 'AVAILABLE' as const,
                points: Array.from({ length: 6 }, (_, index) => ({
                    month: '2026-' + String(index + 4).padStart(2, '0'),
                    revenue: (index + 1) * 100_000,
                })),
            },
            topLostReason: {
                state: 'AVAILABLE' as const,
                value: {
                    reason: 'PRICE',
                    label: 'Harga terlalu tinggi',
                    count: 3,
                    totalValue: 250_000,
                },
            },
        },
    };
}

describe('SalesCommandBoardPage R4A', () => {
    beforeEach(() => {
        mocks.getSalesDashboardStats.mockResolvedValue({
            success: true,
            data: dashboardData(),
        });
    });

    it('orders Health, Attention, then Drivers with canonical definitions and target withheld', async () => {
        render(await SalesCommandBoardPage({ searchParams: Promise.resolve({}) }));

        const text = document.body.textContent ?? '';
        expect(text.indexOf('Health')).toBeLessThan(text.indexOf('Attention'));
        expect(text.indexOf('Attention')).toBeLessThan(text.indexOf('Drivers'));
        expect(screen.getByText('Omzet SO bersih')).toBeTruthy();
        expect(screen.getByText('NOT_CONFIGURED')).toBeTruthy();
        expect(screen.queryByText(/forecast/i)).toBeNull();
        expect(screen.queryByText(/conversion rate/i)).toBeNull();
        expect(screen.getAllByText(/Scope: Seluruh perusahaan/)).toHaveLength(2);
        expect(screen.getByText(/Diperbarui 15.00 WIB/)).toBeTruthy();
        expect(
            screen.getByLabelText(
                /SO non-batal \(termasuk fase quotation\) dikurangi retur terproses.*Unit: IDR/,
            ),
        ).toBeTruthy();
    });

    it('keeps queue totals distinct from returned sample and preserves quick actions', async () => {
        render(await SalesCommandBoardPage({ searchParams: Promise.resolve({}) }));

        expect(screen.getByText('27 total · 1 ditampilkan')).toBeTruthy();
        expect(screen.getByText('8 total · 1 ditampilkan')).toBeTruthy();
        expect(screen.getByRole('link', { name: /Pesanan baru/ })).toBeTruthy();
        expect(screen.getByRole('link', { name: /Penawaran/ })).toBeTruthy();
        expect(screen.getByRole('link', { name: /Jadwal Kirim/ })).toBeTruthy();
    });

    it('does not render nominal values or restricted links without capability', async () => {
        const data = dashboardData();
        if (!data.permissions || !data.health || !data.drivers) {
            throw new Error('Expected AVAILABLE dashboard fixture');
        }
        data.permissions.canViewNominal = false;
        data.permissions.links.performance = null;
        data.permissions.links.pipeline = null;
        data.health.revenue = {
            state: 'HIDDEN',
            value: null,
            targetState: 'NOT_CONFIGURED',
        };
        data.health.pipeline.value = null;
        data.attention!.counts.overdueAmount = null;
        data.attention!.overdueInvoices!.items[0].remaining = undefined;
        data.attention!.creditRisk!.items[0].headroom = undefined;
        data.drivers.revenueTrend = { state: 'HIDDEN', points: [] };
        data.drivers.topLostReason = {
            state: 'AVAILABLE',
            value: {
                ...data.drivers.topLostReason.value!,
                totalValue: null,
            },
        };
        mocks.getSalesDashboardStats.mockResolvedValue({ success: true, data });

        render(await SalesCommandBoardPage({ searchParams: Promise.resolve({}) }));

        expect(screen.queryByText('Omzet SO bersih')).toBeNull();
        expect(screen.getByText('Pipeline aktif')).toBeTruthy();
        expect(screen.queryByText('Rp 1.000.000')).toBeNull();
        expect(screen.queryByRole('link', { name: /Buka pipeline/ })).toBeNull();
    });

    it('shows honest partial failure rather than empty/zero', async () => {
        const data = dashboardData();
        if (!data.health) throw new Error('Expected Health fixture');
        data.health.revenue.state = 'UNAVAILABLE';
        data.health.revenue.value = null;
        data.attention!.state = 'UNAVAILABLE';
        data.drivers!.revenueTrend = {
            state: 'UNAVAILABLE',
            points: [],
        };
        mocks.getSalesDashboardStats.mockResolvedValue({ success: true, data });

        render(await SalesCommandBoardPage({ searchParams: Promise.resolve({}) }));

        expect(screen.getByText('Data tidak tersedia')).toBeTruthy();
        expect(screen.getByText('Sebagian antrean Sales tidak tersedia')).toBeTruthy();
        expect(screen.getByText('Sebagian driver Sales tidak tersedia')).toBeTruthy();
        expect(screen.getByText('SO-READY-21')).toBeTruthy();
    });

    it('renders module-hidden and total read failures without fabricated metrics', async () => {
        mocks.getSalesDashboardStats.mockResolvedValueOnce({
            success: true,
            data: {
                generatedAt: '2026-10-09T08:00:00.000Z',
                state: 'HIDDEN',
                scope: null,
                period: null,
                permissions: null,
                health: null,
                attention: null,
                drivers: null,
            },
        });
        const hidden = render(
            await SalesCommandBoardPage({ searchParams: Promise.resolve({}) }),
        );
        expect(screen.getByText('Modul Sales tidak aktif')).toBeTruthy();
        hidden.unmount();

        mocks.getSalesDashboardStats.mockResolvedValueOnce({
            success: false,
            error: 'unavailable',
        });
        render(await SalesCommandBoardPage({ searchParams: Promise.resolve({}) }));
        expect(screen.getByText('Dashboard Sales tidak tersedia')).toBeTruthy();
        expect(screen.queryByText('Rp 0')).toBeNull();
    });
});
