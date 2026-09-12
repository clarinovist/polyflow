import { describe, expect, it } from 'vitest';
import type { ExecutiveStats } from '@/services/dashboard/executive-stats-service';
import {
    buildKpis,
    buildQuickActions,
    canAccessResource,
    canSeeExecutiveChart,
    encouragementForDate,
    getDashboardPresentation,
    getPortalCta,
    greetingForHour,
    isOpsPortalRole,
    roleDisplayName,
} from '../role-dashboard-config';

const baseStats: ExecutiveStats = {
    sales: {
        mtdRevenue: 100_000_000,
        activeOrders: 5,
        pendingInvoices: 3,
        trend: 10,
    },
    purchasing: { mtdSpending: 40_000_000, pendingPOs: 2, trend: -5 },
    production: {
        activeJobs: 4,
        delayedJobs: 1,
        completionRate: 80,
        yieldRate: 92,
        totalScrapKg: 12,
        downtimeHours: 3,
        runningMachines: 2,
        totalMachines: 5,
        trend: 0,
    },
    inventory: {
        totalValue: 50_000_000,
        lowStockCount: 7,
        totalItems: 120,
        trend: 0,
    },
    cashflow: {
        overdueReceivables: 15_000_000,
        overduePayables: 8_000_000,
        invoicesDueThisWeek: 2,
    },
    revenueTrendChart: [
        { month: '2026-01', revenue: 1 },
        { month: '2026-02', revenue: 2 },
    ],
};

function kpi(role: string, id: string, stats = baseStats) {
    return buildKpis(role, stats).find((item) => item.id === id);
}

describe('role-dashboard-config', () => {
    it('marks warehouse/production as ops portal roles', () => {
        expect(isOpsPortalRole('WAREHOUSE')).toBe(true);
        expect(isOpsPortalRole('PRODUCTION')).toBe(true);
        expect(isOpsPortalRole('FINANCE')).toBe(false);
        expect(getPortalCta('WAREHOUSE')).toMatchObject({
            href: '/warehouse',
            resourceHint: '/warehouse',
        });
        expect(getPortalCta('PRODUCTION')).toMatchObject({
            href: '/production',
            resourceHint: '/production',
        });
        expect(getPortalCta('ADMIN')).toBeNull();
    });

    it('shows executive chart only for admin and finance', () => {
        expect(canSeeExecutiveChart('ADMIN')).toBe(true);
        expect(canSeeExecutiveChart('FINANCE')).toBe(true);
        expect(canSeeExecutiveChart('SALES')).toBe(false);
        expect(canSeeExecutiveChart('WAREHOUSE')).toBe(false);
    });

    it('deep-links actionable KPIs into the specific filtered queue', () => {
        expect(kpi('FINANCE', 'overdueAr')?.href).toBe(
            '/finance/invoices/sales?overdue=true',
        );
        expect(kpi('FINANCE', 'overdueAp')?.href).toBe(
            '/finance/invoices/purchase?overdue=true',
        );
        expect(kpi('WAREHOUSE', 'lowStock')?.href).toBe(
            '/warehouse/inventory?lowStock=true',
        );
        expect(kpi('PROCUREMENT', 'pendingPo')?.href).toBe(
            '/purchasing/orders?status=DRAFT,SENT',
        );
        expect(kpi('SALES', 'activeOrders')).toMatchObject({
            title: 'Pesanan Aktif (MTD)',
            href: '/sales/orders?status=CONFIRMED,IN_PRODUCTION,READY_TO_SHIP,SHIPPED',
            resourceHint: '/sales/orders',
        });
        expect(kpi('PRODUCTION', 'activeJobs')).toMatchObject({
            href: '/production/orders?late=1',
            resourceHint: '/production/orders',
        });
    });

    it('does not style non-actionable or empty queue metrics as links', () => {
        expect(kpi('ADMIN', 'revenue')?.href).toBeUndefined();
        expect(kpi('ADMIN', 'spending')?.href).toBeUndefined();
        expect(kpi('ADMIN', 'machines')?.href).toBeUndefined();
        expect(kpi('ADMIN', 'productionYield')?.href).toBeUndefined();

        const emptyStats: ExecutiveStats = {
            ...baseStats,
            sales: { ...baseStats.sales, activeOrders: 0 },
            purchasing: { ...baseStats.purchasing, pendingPOs: 0 },
            production: { ...baseStats.production, delayedJobs: 0 },
            inventory: { ...baseStats.inventory, lowStockCount: 0 },
            cashflow: {
                overdueReceivables: 0,
                overduePayables: 0,
                invoicesDueThisWeek: 0,
            },
        };
        expect(kpi('FINANCE', 'overdueAr', emptyStats)?.href).toBeUndefined();
        expect(kpi('FINANCE', 'overdueAp', emptyStats)?.href).toBeUndefined();
        expect(kpi('WAREHOUSE', 'lowStock', emptyStats)?.href).toBeUndefined();
        expect(kpi('PROCUREMENT', 'pendingPo', emptyStats)?.href).toBeUndefined();
        expect(kpi('PLANNING', 'activeJobs', emptyStats)?.href).toBeUndefined();
        expect(kpi('SALES', 'activeOrders', emptyStats)?.href).toBeUndefined();
    });

    it('separates machine utilization from production yield semantics', () => {
        const production = buildKpis('PRODUCTION', baseStats);
        const machines = production.find((item) => item.id === 'machines');
        const productionYield = production.find(
            (item) => item.id === 'productionYield',
        );

        expect(machines).toMatchObject({
            title: 'Mesin Berjalan Saat Ini',
            value: '2 dari 5 mesin aktif',
            subtitle: 'Snapshot status saat dashboard diperbarui',
            trendValue: 'Saat ini',
        });
        expect(machines?.progressValue).toBeUndefined();
        expect(machines?.subtitle).not.toContain('Yield');
        expect(productionYield).toMatchObject({
            title: 'Yield Produksi (MTD)',
            value: '92.0%',
            subtitle: 'Output dibanding bahan terpakai',
            trendValue: 'Periode bulan berjalan',
            progressValue: 92,
        });
    });

    it('states trend direction and comparison period explicitly', () => {
        expect(kpi('ADMIN', 'revenue')?.trendValue).toBe(
            'Naik 10.0% dibanding bulan lalu',
        );
        expect(kpi('ADMIN', 'spending')?.trendValue).toBe(
            'Turun 5.0% dibanding bulan lalu',
        );

        const flatStats: ExecutiveStats = {
            ...baseStats,
            sales: { ...baseStats.sales, trend: 0 },
        };
        expect(kpi('ADMIN', 'revenue', flatStats)?.trendValue).toBe(
            'Tetap 0.0% dibanding bulan lalu',
        );

        const noComparisonStats: ExecutiveStats = {
            ...baseStats,
            sales: { ...baseStats.sales, trend: undefined },
        };
        expect(kpi('ADMIN', 'revenue', noComparisonStats)?.trendValue).toBe(
            'Belum ada data pembanding bulan lalu',
        );
    });

    it('returns role-specific permission-filterable task shortcuts', () => {
        expect(
            buildQuickActions('FINANCE').some((item) =>
                item.href.includes('/finance'),
            ),
        ).toBe(true);
        expect(
            buildQuickActions('SALES').some((item) =>
                item.href.includes('/sales'),
            ),
        ).toBe(true);
        expect(
            buildQuickActions('FINANCE').every((item) => item.resourceHint),
        ).toBe(true);
    });

    it('checks hierarchical permissions asymmetrically and preserves mobile aliases', () => {
        expect(canAccessResource('ALL', '/finance')).toBe(true);
        expect(canAccessResource(['/sales'], '/sales/orders')).toBe(true);
        expect(canAccessResource(['/sales/orders'], '/sales')).toBe(false);
        expect(
            canAccessResource(['/sales/orders'], '/sales/orders/create'),
        ).toBe(true);
        expect(
            canAccessResource(['/sales/orders/create'], '/sales/orders'),
        ).toBe(false);
        expect(
            canAccessResource(['/sales/orders'], '/sales/invoices'),
        ).toBe(false);
        expect(canAccessResource(['/sales'], '/finance')).toBe(false);

        expect(canAccessResource(['/sales/mobile'], '/field/sales')).toBe(true);
        expect(canAccessResource(['/field/sales'], '/sales/mobile')).toBe(true);
        expect(
            canAccessResource(
                ['/sales/mobile/orders'],
                '/field/sales/orders/create',
            ),
        ).toBe(true);
        expect(
            canAccessResource(
                ['/field/sales/orders'],
                '/sales/mobile/customers',
            ),
        ).toBe(false);
        expect(
            canAccessResource(['/field/sales/orders'], '/field/sales'),
        ).toBe(false);
    });

    it('links create tasks to their actual destinations with exact resource hints', () => {
        expect(
            buildQuickActions('SALES').find((item) => item.label === 'SO Baru'),
        ).toMatchObject({
            href: '/sales/orders/create',
            resourceHint: '/sales/orders/create',
        });
        expect(
            buildQuickActions('PROCUREMENT').find(
                (item) => item.label === 'PO Baru',
            ),
        ).toMatchObject({
            href: '/purchasing/orders/create',
            resourceHint: '/purchasing/orders/create',
        });
    });

    it('uses the exact CTA destination as every shortcut resource hint', () => {
        for (const role of [
            'ADMIN',
            'FINANCE',
            'SALES',
            'PROCUREMENT',
            'PLANNING',
            'WAREHOUSE',
            'PRODUCTION',
            'HRD',
        ]) {
            for (const action of buildQuickActions(role)) {
                expect(action.resourceHint).toBe(action.href);
            }
        }
    });

    it('labels the active SPK population truthfully and localizes KPI terms', () => {
        expect(kpi('PRODUCTION', 'activeJobs')).toMatchObject({
            title: 'SPK Dirilis/Berjalan',
            value: '4',
            trendValue: 'Ada keterlambatan',
        });
        expect(kpi('PROCUREMENT', 'pendingPo')?.subtitle).toBe(
            'Rp 40.000.000 pengeluaran bulan berjalan (MTD)',
        );
        expect(kpi('PRODUCTION', 'scrap')).toMatchObject({
            title: 'Sisa Produksi (MTD)',
            subtitle: 'Waktu henti 3.0 jam',
            trendValue: 'Pantau rendemen produksi',
        });

        const onScheduleStats: ExecutiveStats = {
            ...baseStats,
            production: {
                ...baseStats.production,
                delayedJobs: 0,
                totalScrapKg: 0,
            },
        };
        expect(kpi('PRODUCTION', 'activeJobs', onScheduleStats)).toMatchObject({
            trendValue: 'Sesuai jadwal',
            resourceHint: '/production/orders',
        });
        expect(
            kpi('PRODUCTION', 'activeJobs', onScheduleStats)?.href,
        ).toBeUndefined();
        expect(kpi('PRODUCTION', 'scrap', onScheduleStats)?.trendValue).toBe(
            'Bersih',
        );
    });

    it('maps role display names and hours to greetings', () => {
        expect(roleDisplayName('WAREHOUSE')).toBe('Gudang');
        expect(roleDisplayName('FINANCE')).toBe('Finance');
        expect(greetingForHour(8)).toBe('Selamat pagi');
        expect(greetingForHour(12)).toBe('Selamat siang');
        expect(greetingForHour(16)).toBe('Selamat sore');
        expect(greetingForHour(21)).toBe('Selamat malam');
    });

    it('returns stable daily encouragement that can change across days', () => {
        const morningA = encouragementForDate(new Date(2026, 6, 26, 9, 0, 0));
        const morningB = encouragementForDate(new Date(2026, 6, 26, 9, 30, 0));
        const nextDay = encouragementForDate(new Date(2026, 6, 27, 9, 0, 0));
        const evening = encouragementForDate(new Date(2026, 6, 26, 17, 0, 0));

        expect(morningA.length).toBeGreaterThan(10);
        expect(morningA).toBe(morningB);
        expect(nextDay).not.toBe(morningA);
        expect(evening).not.toBe(morningA);
    });

    it('creates the refresh timestamp in the business timezone', () => {
        expect(
            getDashboardPresentation(new Date('2026-09-12T14:00:00.000Z')),
        ).toMatchObject({
            currentDate: 'Sabtu, 12 September 2026',
            greeting: 'Selamat malam',
            lastUpdated: '21.00 WIB',
        });
    });
});
