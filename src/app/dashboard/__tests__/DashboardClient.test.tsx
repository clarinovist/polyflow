import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExecutiveStats } from '@/services/dashboard/executive-stats-service';
import { getDashboardPresentation } from '@/lib/dashboard/role-dashboard-config';
import DashboardClient from '../DashboardClient';

vi.mock('next/navigation', () => ({
    useRouter: () => ({ refresh: vi.fn() }),
}));

const stats: ExecutiveStats = {
    sales: {
        mtdRevenue: 100_000,
        activeOrders: 1,
        pendingInvoices: 0,
        trend: 0,
    },
    purchasing: { mtdSpending: 50_000, pendingPOs: 0, trend: 0 },
    production: {
        activeJobs: 0,
        delayedJobs: 0,
        completionRate: 100,
        yieldRate: 100,
        totalScrapKg: 0,
        downtimeHours: 0,
        runningMachines: 0,
        totalMachines: 0,
        trend: 0,
    },
    inventory: {
        totalValue: 0,
        lowStockCount: 0,
        totalItems: 0,
        trend: 0,
    },
    cashflow: {
        overdueReceivables: 0,
        overduePayables: 0,
        invoicesDueThisWeek: 0,
    },
    revenueTrendChart: [],
};

const presentation = {
    currentDate: 'Sabtu, 12 September 2026',
    greeting: 'Selamat malam',
    encouragement: 'Pesan dashboard yang stabil.',
};

afterEach(() => {
    vi.useRealTimers();
});

describe('DashboardClient hydration safety', () => {
    it('builds the presentation snapshot in Asia/Jakarta', () => {
        expect(
            getDashboardPresentation(
                new Date('2026-09-12T14:00:00.000Z'),
            ),
        ).toMatchObject({
            currentDate: 'Sabtu, 12 September 2026',
            greeting: 'Selamat malam',
        });
    });

    it('renders only the server-provided Jakarta presentation snapshot', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-12T14:00:00.000Z'));

        const html = renderToStaticMarkup(
            <DashboardClient
                stats={stats}
                ceoNotes={[]}
                userName="Budi Santoso"
                userRole="ADMIN"
                permissions="ALL"
                presentation={presentation}
            />,
        );

        expect(html).toContain(presentation.currentDate);
        expect(html).toContain(`${presentation.greeting}, Budi`);
        expect(html).toContain(presentation.encouragement);
    });
});
