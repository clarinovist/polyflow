import { describe, expect, it } from 'vitest';
import type { ExecutiveStats } from '@/services/dashboard/executive-stats-service';
import {
  buildAttentionItems,
  buildKpis,
  buildQuickActions,
  canAccessResource,
  canSeeExecutiveChart,
  encouragementForDate,
  getPortalCta,
  greetingForHour,
  personalAttentionLine,
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

    const sales = buildKpis('SALES', baseStats);
    expect(sales.map((k) => k.id)).toEqual(
      expect.arrayContaining(['activeOrders', 'revenue'])
    );

    const warehouse = buildKpis('WAREHOUSE', baseStats);
    expect(warehouse[0].id).toBe('lowStock');
  });

  it('filters attention items with count > 0 for role', () => {
    const admin = buildAttentionItems('ADMIN', baseStats);
    expect(admin.some((i) => i.id === 'overdue-ar')).toBe(true);
    expect(admin.some((i) => i.id === 'low-stock')).toBe(true);
    // overdue-ap amount is 0 → filtered out
    expect(admin.some((i) => i.id === 'overdue-ap')).toBe(false);

    const production = buildAttentionItems('PRODUCTION', baseStats);
    expect(production.every((i) =>
      ['delayed-jobs', 'active-jobs', 'scrap', 'low-stock'].includes(i.id)
    )).toBe(true);
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

  it('builds personal attention line correctly', () => {
    expect(personalAttentionLine([])).toBe('Semua area operasional aman & lancar.');

    const singleItem = [
      { id: 'delayed-jobs', label: 'SPK lewat jadwal', count: 2, href: '/production/orders', severity: 'critical' as const },
    ];
    expect(personalAttentionLine(singleItem)).toBe(
      'Hari ini untukmu: 1 area perlu perhatian — teratas: SPK lewat jadwal (2).'
    );

    const multiItem = [
      { id: 'overdue-ar', label: 'Piutang overdue · Rp 15.000.000', count: 1, href: '/finance', severity: 'critical' as const },
      { id: 'low-stock', label: 'Item stok rendah', count: 5, href: '/warehouse', severity: 'warning' as const },
    ];
    expect(personalAttentionLine(multiItem)).toBe(
      'Hari ini untukmu: 2 area perlu perhatian — teratas: Piutang overdue · Rp 15.000.000.'
    );
  });
});

