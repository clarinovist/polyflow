// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getSalesDashboardStats: vi.fn(),
}));

vi.mock('@/actions/dashboard/sales-dashboard', () => ({
    getSalesDashboardStats: mocks.getSalesDashboardStats,
}));

import SalesCommandBoardPage from '../page';

function dashboardData(draftOrders: number) {
    return {
        counts: {
            draftOrders,
            readyToShipOrders: 2,
            openDeliveryOrders: 3,
            tripsToday: 4,
            overdueInvoices: 1,
            overdueAmount: 100_000,
            activeOrders: 5,
            activeCustomers: 6,
        },
        attention: {
            oldDrafts: [],
            readyWithoutDo: [],
            openDeliveries: [],
            overdueInvoices: [],
            creditRisk: [],
            followUpsDue: [],
        },
        performance: {
            totalRevenue: 1_000_000,
            revenueDefinition: 'journal_4xx' as const,
            revenueTrend: [],
            totalOrders: 5,
        },
    };
}

describe('SalesCommandBoardPage', () => {
    beforeEach(() => {
        mocks.getSalesDashboardStats.mockResolvedValue({
            success: true,
            data: dashboardData(1),
        });
    });

    it('keeps positive-count queue cards linked to their filtered targets', async () => {
        render(
            await SalesCommandBoardPage({ searchParams: Promise.resolve({}) }),
        );

        expect(
            screen.getByText('SO draf').closest('a')?.getAttribute('href'),
        ).toBe('/sales/orders?status=DRAFT');
        expect(
            screen.getByText('Jatuh tempo').closest('a')?.getAttribute('href'),
        ).toBe('/sales/invoices?status=OVERDUE');
        expect(screen.getByText('Pesanan baru')).toBeTruthy();
        expect(screen.queryByText('Order Baru')).not.toBeTruthy();
    });

    it('shows a zero-count queue card without link semantics or action styling', async () => {
        mocks.getSalesDashboardStats.mockResolvedValue({
            success: true,
            data: dashboardData(0),
        });

        render(
            await SalesCommandBoardPage({ searchParams: Promise.resolve({}) }),
        );

        const title = screen.getByText('SO draf');
        expect(title.closest('a')).toBeNull();
        const card = title.closest('[data-slot="card"]');
        expect(card?.classList.contains('cursor-pointer')).toBe(false);
        expect(card?.classList.contains('hover:border-primary/50')).toBe(
            false,
        );
    });
});
