import { describe, expect, it } from 'vitest';
import type { ExecutiveStats } from '@/services/dashboard/executive-stats-service';
import {
  buildKpis,
  buildQuickActions,
  canAccessResource,
  canSeeExecutiveChart,
  encouragementForDate,
  getPortalCta,
  greetingForHour,
  isOpsPortalRole,
  roleDisplayName,
} from '../role-dashboard-config';

const baseStats: ExecutiveStats = {
  sales: { mtdRevenue: 100_000_000, activeOrders: 5, pendingInvoices: 3, trend: 10 },
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
  inventory: { totalValue: 50_000_000, lowStockCount: 7, totalItems: 120, trend: 0 },
  cashflow: { overdueReceivables: 15_000_000, overduePayables: 0, invoicesDueThisWeek: 2 },
  revenueTrendChart: [
    { month: '2026-01', revenue: 1 },
    { month: '2026-02', revenue: 2 },
  ],
};

describe('role-dashboard-config', () => {
  it('marks warehouse/production as ops portal roles', () => {
    expect(isOpsPortalRole('WAREHOUSE')).toBe(true);
    expect(isOpsPortalRole('PRODUCTION')).toBe(true);
    expect(isOpsPortalRole('FINANCE')).toBe(false);
    expect(getPortalCta('WAREHOUSE')?.href).toBe('/warehouse');
    expect(getPortalCta('PRODUCTION')?.href).toBe('/production');
    expect(getPortalCta('ADMIN')).toBeNull();
  });

  it('shows executive chart only for admin and finance', () => {
    expect(canSeeExecutiveChart('ADMIN')).toBe(true);
    expect(canSeeExecutiveChart('FINANCE')).toBe(true);
    expect(canSeeExecutiveChart('SALES')).toBe(false);
    expect(canSeeExecutiveChart('WAREHOUSE')).toBe(false);
  });

  it('builds role-specific KPIs', () => {
    const finance = buildKpis('FINANCE', baseStats);
    expect(finance.map((k) => k.id)).toEqual(
      expect.arrayContaining(['overdueAr', 'overdueAp', 'dueWeek', 'revenue'])
    );
    // overdue KPI cards must deep-link into the filtered invoice view, not the bare list
    expect(finance.find((k) => k.id === 'overdueAr')?.href).toBe(
      '/finance/invoices/sales?status=OVERDUE'
    );
    expect(finance.find((k) => k.id === 'overdueAp')?.href).toBe(
      '/finance/invoices/purchase?status=OVERDUE'
    );

    const sales = buildKpis('SALES', baseStats);
    expect(sales.map((k) => k.id)).toEqual(
      expect.arrayContaining(['activeOrders', 'revenue'])
    );

    const warehouse = buildKpis('WAREHOUSE', baseStats);
    expect(warehouse[0].id).toBe('lowStock');
  });

  it('shows a distinct label when there is no prior-month trend data, not "0%"', () => {
    const statsNoTrendData: ExecutiveStats = {
      ...baseStats,
      sales: { ...baseStats.sales, trend: undefined },
      purchasing: { ...baseStats.purchasing, trend: undefined },
    };
    const admin = buildKpis('ADMIN', statsNoTrendData);
    const revenue = admin.find((k) => k.id === 'revenue');
    const spending = admin.find((k) => k.id === 'spending');

    expect(revenue?.trendValue).toBe('Belum ada data bulan lalu');
    expect(revenue?.trend).toBe('neutral');
    expect(spending?.trendValue).toBe('Belum ada data bulan lalu');
    expect(spending?.trend).toBe('neutral');

    // A real 0% change still reads as "0.0% vs bulan lalu", distinct from no-data.
    const statsFlat: ExecutiveStats = {
      ...baseStats,
      sales: { ...baseStats.sales, trend: 0 },
    };
    const flatRevenue = buildKpis('ADMIN', statsFlat).find((k) => k.id === 'revenue');
    expect(flatRevenue?.trendValue).toBe('0.0% vs bulan lalu');
  });

  it('returns role-specific quick actions', () => {
    expect(buildQuickActions('FINANCE').some((a) => a.href.includes('/finance'))).toBe(true);
    expect(buildQuickActions('SALES').some((a) => a.href.includes('/sales'))).toBe(true);
  });

  it('checks resource permissions', () => {
    expect(canAccessResource('ALL', '/finance')).toBe(true);
    expect(canAccessResource(['/sales', '/warehouse'], '/sales/orders')).toBe(true);
    expect(canAccessResource(['/sales'], '/finance')).toBe(false);
  });

  it('maps role display names', () => {
    expect(roleDisplayName('WAREHOUSE')).toBe('Gudang');
    expect(roleDisplayName('FINANCE')).toBe('Finance');
  });

  it('maps hour to greeting', () => {
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
    expect(morningA).toBe(morningB); // same day + same period → stable
    expect(nextDay).not.toBe(morningA); // next day → different pick
    expect(evening).not.toBe(morningA); // different period → different pool
    expect(typeof evening).toBe('string');
  });
});

