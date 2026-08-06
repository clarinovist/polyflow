/**
 * Role-aware dashboard configuration for /dashboard command home.
 * Maps active role → KPIs, attention rules, quick actions, portal CTA.
 */

import type { LucideIcon } from 'lucide-react';
import {
    Banknote,
    ClipboardList,
    CreditCard,
    Factory,
    FileText,
    Package,
    Plus,
    ShoppingCart,
    Smartphone,
    TrendingDown,
    TrendingUp,
    Truck,
    Wallet,
    Warehouse,
    CalendarClock,
    Receipt,
    Settings,
    Users,
} from 'lucide-react';
import type { ExecutiveStats } from '@/services/dashboard/executive-stats-service';
import { formatRupiah } from '@/lib/utils/utils';

export type DashboardRole =
    | 'ADMIN'
    | 'WAREHOUSE'
    | 'PRODUCTION'
    | 'SALES'
    | 'PLANNING'
    | 'FINANCE'
    | 'PROCUREMENT'
    | string;

export type KpiTrend = 'up' | 'down' | 'neutral';

export interface DashboardKpi {
    id: string;
    title: string;
    value: string;
    subtitle: string;
    icon: LucideIcon;
    trend: KpiTrend;
    trendValue: string;
    progressValue?: number;
    progressColor?: string;
    href?: string;
}

export interface AttentionItem {
    id: string;
    label: string;
    count: number;
    href: string;
    severity: 'critical' | 'warning' | 'info';
    /** Permission prefix required (skipped when permissions === 'ALL') */
    resourceHint?: string;
}

export interface QuickActionItem {
    href: string;
    label: string;
    icon: LucideIcon;
    color: string;
    bg: string;
    border: string;
    resourceHint?: string;
}

export interface ModuleShortcut {
    href: string;
    label: string;
    description: string;
    icon: LucideIcon;
    iconBg: string;
    iconColor: string;
    resourceHint: string;
}

export interface PortalCta {
    href: string;
    title: string;
    description: string;
    ctaLabel: string;
}

function trendFromNumber(n: number | undefined, invert = false): KpiTrend {
    if (n === undefined || n === 0) return 'neutral';
    const positive = n > 0;
    if (invert) return positive ? 'down' : 'up';
    return positive ? 'up' : 'down';
}

function pctLabel(n: number | undefined, suffix: string): string {
    const v = n !== undefined ? Math.abs(n).toFixed(1) : '0';
    return `${v}% ${suffix}`;
}

/** Roles that land on ops portals by default — show compact dashboard + deep link */
export function isOpsPortalRole(role: DashboardRole): boolean {
    const r = role.toUpperCase();
    return r === 'WAREHOUSE' || r === 'PRODUCTION';
}

export function getPortalCta(role: DashboardRole): PortalCta | null {
    const r = role.toUpperCase();
    if (r === 'WAREHOUSE') {
        return {
            href: '/warehouse',
            title: 'Portal Gudang',
            description:
                'Buka papan shift: terima barang, muat, bahan produksi, dan stok rendah.',
            ctaLabel: 'Buka Portal Gudang',
        };
    }
    if (r === 'PRODUCTION') {
        return {
            href: '/production',
            title: 'Portal Produksi',
            description:
                'Buka pulse lantai, antrean SPK, dan overview mesin shift ini.',
            ctaLabel: 'Buka Portal Produksi',
        };
    }
    if (r === 'HRD') {
        return {
            href: '/hrd',
            title: 'Portal HRD',
            description: 'Kehadiran, payroll, cuti, dan manajemen karyawan.',
            ctaLabel: 'Buka Portal HRD',
        };
    }
    return null;
}

/** Show revenue chart + cashflow emphasis for these roles */
export function canSeeExecutiveChart(role: DashboardRole): boolean {
    const r = role.toUpperCase();
    return r === 'ADMIN' || r === 'FINANCE';
}

export function buildKpis(
    role: DashboardRole,
    stats: ExecutiveStats,
): DashboardKpi[] {
    const r = role.toUpperCase();
    const vs = 'vs bulan lalu';

    const revenue: DashboardKpi = {
        id: 'revenue',
        title: 'Pendapatan (MTD)',
        value: formatRupiah(stats.sales.mtdRevenue),
        subtitle: `${stats.sales.activeOrders} pesanan aktif`,
        icon: Wallet,
        trend: trendFromNumber(stats.sales.trend),
        trendValue: pctLabel(stats.sales.trend, vs),
        href: '/sales',
    };

    const spending: DashboardKpi = {
        id: 'spending',
        title: 'Pengeluaran (MTD)',
        value: formatRupiah(stats.purchasing.mtdSpending),
        subtitle: `${stats.purchasing.pendingPOs} PO tertunda`,
        icon: ShoppingCart,
        trend: trendFromNumber(stats.purchasing.trend, true),
        trendValue: pctLabel(stats.purchasing.trend, vs),
        href: '/purchasing',
    };

    const machines: DashboardKpi = {
        id: 'machines',
        title: 'Utilisasi Mesin',
        value: `${stats.production.runningMachines} / ${stats.production.totalMachines} berjalan`,
        subtitle: `Yield: ${stats.production.yieldRate.toFixed(1)}%`,
        icon: Factory,
        trend: 'neutral',
        trendValue: 'Kapasitas shift',
        progressValue: Math.min(100, stats.production.yieldRate),
        progressColor: 'bg-blue-600',
        href: '/production',
    };

    const inventory: DashboardKpi = {
        id: 'inventory',
        title: 'Nilai Stok',
        value: formatRupiah(stats.inventory.totalValue),
        subtitle: `${stats.inventory.lowStockCount} stok rendah`,
        icon: Package,
        trend: stats.inventory.lowStockCount > 0 ? 'down' : 'neutral',
        trendValue:
            stats.inventory.lowStockCount > 0
                ? 'Perlu perhatian'
                : 'Level aman',
        href: '/warehouse/inventory',
    };

    const lowStock: DashboardKpi = {
        id: 'lowStock',
        title: 'Stok Rendah',
        value: stats.inventory.lowStockCount.toString(),
        subtitle: `${stats.inventory.totalItems.toLocaleString()} item total`,
        icon: Package,
        trend: stats.inventory.lowStockCount > 0 ? 'down' : 'neutral',
        trendValue:
            stats.inventory.lowStockCount > 0 ? 'Perlu restock' : 'Aman',
        href: '/warehouse/inventory',
    };

    const overdueAr: DashboardKpi = {
        id: 'overdueAr',
        title: 'Piutang Overdue',
        value: formatRupiah(stats.cashflow.overdueReceivables),
        subtitle: `${stats.sales.pendingInvoices} invoice belum lunas`,
        icon: TrendingUp,
        trend: stats.cashflow.overdueReceivables > 0 ? 'down' : 'neutral',
        trendValue:
            stats.cashflow.overdueReceivables > 0 ? 'Tagih segera' : 'Lancar',
        href: '/finance/invoices/sales',
    };

    const overdueAp: DashboardKpi = {
        id: 'overdueAp',
        title: 'Hutang Overdue',
        value: formatRupiah(stats.cashflow.overduePayables),
        subtitle: `${stats.cashflow.invoicesDueThisWeek} jatuh tempo minggu ini`,
        icon: TrendingDown,
        trend: stats.cashflow.overduePayables > 0 ? 'down' : 'neutral',
        trendValue:
            stats.cashflow.overduePayables > 0 ? 'Bayar segera' : 'Lancar',
        href: '/finance/invoices/purchase',
    };

    const dueWeek: DashboardKpi = {
        id: 'dueWeek',
        title: 'Jatuh Tempo Minggu Ini',
        value: stats.cashflow.invoicesDueThisWeek.toString(),
        subtitle: 'Invoice piutang',
        icon: CalendarClock,
        trend: stats.cashflow.invoicesDueThisWeek > 3 ? 'down' : 'neutral',
        trendValue:
            stats.cashflow.invoicesDueThisWeek > 0
                ? 'Siapkan penagihan'
                : 'Tidak ada',
        href: '/finance/invoices/sales',
    };

    const activeOrders: DashboardKpi = {
        id: 'activeOrders',
        title: 'Pesanan Aktif',
        value: stats.sales.activeOrders.toString(),
        subtitle: `${stats.sales.pendingInvoices} invoice tertunda`,
        icon: FileText,
        trend: 'neutral',
        trendValue: 'Sales order berjalan',
        href: '/sales/orders',
    };

    const pendingPo: DashboardKpi = {
        id: 'pendingPo',
        title: 'PO Tertunda',
        value: stats.purchasing.pendingPOs.toString(),
        subtitle: formatRupiah(stats.purchasing.mtdSpending) + ' spend MTD',
        icon: ShoppingCart,
        trend: stats.purchasing.pendingPOs > 0 ? 'neutral' : 'up',
        trendValue:
            stats.purchasing.pendingPOs > 0
                ? 'Perlu follow-up'
                : 'Antrian kosong',
        href: '/purchasing/orders',
    };

    const activeJobs: DashboardKpi = {
        id: 'activeJobs',
        title: 'SPK Aktif',
        value: stats.production.activeJobs.toString(),
        subtitle: `${stats.production.delayedJobs} terlambat`,
        icon: ClipboardList,
        trend: stats.production.delayedJobs > 0 ? 'down' : 'neutral',
        trendValue:
            stats.production.delayedJobs > 0 ? 'Ada keterlambatan' : 'On track',
        href: '/production/orders',
    };

    const scrap: DashboardKpi = {
        id: 'scrap',
        title: 'Scrap (MTD)',
        value: `${stats.production.totalScrapKg.toFixed(1)} kg`,
        subtitle: `Downtime ${stats.production.downtimeHours.toFixed(1)} jam`,
        icon: Factory,
        trend: stats.production.totalScrapKg > 0 ? 'down' : 'neutral',
        trendValue:
            stats.production.totalScrapKg > 0 ? 'Pantau yield' : 'Bersih',
        href: '/production/analytics',
    };

    const cashPressure: DashboardKpi = {
        id: 'cashPressure',
        title: 'Tekanan Kas (AR+AP)',
        value: formatRupiah(
            stats.cashflow.overdueReceivables + stats.cashflow.overduePayables,
        ),
        subtitle: 'Overdue piutang + hutang',
        icon: Banknote,
        trend:
            stats.cashflow.overdueReceivables + stats.cashflow.overduePayables >
            0
                ? 'down'
                : 'neutral',
        trendValue:
            stats.cashflow.overdueReceivables + stats.cashflow.overduePayables >
            0
                ? 'Perlu aksi kas'
                : 'Sehat',
        href: '/finance/aging',
    };

    switch (r) {
        case 'FINANCE':
            return [overdueAr, overdueAp, dueWeek, revenue];
        case 'SALES':
            return [activeOrders, revenue, overdueAr, inventory];
        case 'PROCUREMENT':
            return [pendingPo, spending, overdueAp, lowStock];
        case 'PLANNING':
            return [activeJobs, machines, lowStock, activeOrders];
        case 'WAREHOUSE':
            return [lowStock, inventory, activeJobs, pendingPo];
        case 'PRODUCTION':
            return [machines, activeJobs, scrap, lowStock];
        case 'HRD':
            // HRD has its own portal dashboard (/hrd) with dedicated KPIs.
            // Generic dashboard shows only quick actions + module shortcuts.
            return [];
        case 'ADMIN':
        default:
            return [revenue, spending, machines, cashPressure];
    }
}

export function buildAttentionItems(
    role: DashboardRole,
    stats: ExecutiveStats,
): AttentionItem[] {
    const r = role.toUpperCase();

    const all: AttentionItem[] = [
        {
            id: 'overdue-ar',
            label: 'Piutang overdue',
            count: stats.cashflow.overdueReceivables > 0 ? 1 : 0,
            href: '/finance/invoices/sales?status=OVERDUE',
            severity: 'critical',
            resourceHint: '/finance',
            // Use amount as signal; count 1 if amount > 0. Better: use pending if we only have amount.
        },
        {
            id: 'overdue-ap',
            label: 'Hutang overdue',
            count: stats.cashflow.overduePayables > 0 ? 1 : 0,
            href: '/finance/invoices/purchase?status=OVERDUE',
            severity: 'critical',
            resourceHint: '/finance',
        },
        {
            id: 'due-week',
            label: 'Invoice jatuh tempo minggu ini',
            count: stats.cashflow.invoicesDueThisWeek,
            // No meaningful filter in InvoiceTable for due-this-week range; leave plain link (known limitation - Gap 3)
            href: '/finance/invoices/sales',
            severity: 'warning',
            resourceHint: '/finance',
        },
        {
            id: 'pending-invoices',
            label: 'Invoice penjualan belum lunas',
            count: stats.sales.pendingInvoices,
            href: '/sales/invoices?status=PENDING',
            severity: 'warning',
            resourceHint: '/sales',
        },
        {
            id: 'pending-po',
            label: 'PO tertunda (draft/sent)',
            count: stats.purchasing.pendingPOs,
            href: '/purchasing/orders?status=DRAFT,SENT',
            severity: 'warning',
            resourceHint: '/purchasing',
        },
        {
            id: 'delayed-jobs',
            label: 'SPK lewat jadwal',
            count: stats.production.delayedJobs,
            href: '/production/orders',
            severity: 'critical',
            resourceHint: '/production',
        },
        {
            id: 'active-jobs',
            label: 'SPK aktif',
            count: stats.production.activeJobs,
            href: '/production/daily',
            severity: 'info',
            resourceHint: '/production',
        },
        {
            id: 'low-stock',
            label: 'Item stok rendah',
            count: stats.inventory.lowStockCount,
            href: '/warehouse/inventory?lowStock=true',
            severity: 'warning',
            resourceHint: '/warehouse',
        },
        {
            id: 'scrap',
            label: 'Scrap tercatat (MTD, kg)',
            count: Math.round(stats.production.totalScrapKg),
            href: '/production/analytics',
            severity: stats.production.totalScrapKg > 50 ? 'warning' : 'info',
            resourceHint: '/production',
        },
    ];

    // Enrich AR/AP labels with amounts; badge shows 1 when amount > 0 (no discrete count)
    const enriched = all.map((item) => {
        if (item.id === 'overdue-ar' && stats.cashflow.overdueReceivables > 0) {
            return {
                ...item,
                label: `Piutang overdue · ${formatRupiah(stats.cashflow.overdueReceivables)}`,
                count: 1,
            };
        }
        if (item.id === 'overdue-ap' && stats.cashflow.overduePayables > 0) {
            return {
                ...item,
                label: `Hutang overdue · ${formatRupiah(stats.cashflow.overduePayables)}`,
                count: 1,
            };
        }
        return item;
    });

    const roleAllow: Record<string, string[]> = {
        ADMIN: [
            'overdue-ar',
            'overdue-ap',
            'due-week',
            'delayed-jobs',
            'low-stock',
            'pending-po',
            'pending-invoices',
        ],
        FINANCE: ['overdue-ar', 'overdue-ap', 'due-week', 'pending-invoices'],
        SALES: ['pending-invoices', 'overdue-ar', 'due-week', 'low-stock'],
        PROCUREMENT: ['pending-po', 'overdue-ap', 'low-stock'],
        PLANNING: ['delayed-jobs', 'active-jobs', 'low-stock', 'pending-po'],
        WAREHOUSE: ['low-stock', 'active-jobs', 'pending-po'],
        PRODUCTION: ['delayed-jobs', 'active-jobs', 'scrap', 'low-stock'],
        HRD: [],
    };

    const allowed = roleAllow[r] ?? roleAllow.ADMIN;
    return enriched
        .filter((i) => allowed.includes(i.id))
        .filter((i) => i.count > 0)
        .sort((a, b) => {
            const sev = { critical: 0, warning: 1, info: 2 };
            return sev[a.severity] - sev[b.severity];
        });
}

export function buildQuickActions(role: DashboardRole): QuickActionItem[] {
    const r = role.toUpperCase();

    const catalog: Record<string, QuickActionItem[]> = {
        ADMIN: [
            {
                href: '/dashboard/products/create',
                label: 'Tambah Produk',
                icon: Package,
                color: 'text-emerald-600',
                bg: 'bg-emerald-50 dark:bg-emerald-900/10',
                border: 'hover:border-emerald-200 dark:hover:border-emerald-800',
                resourceHint: '/dashboard/products',
            },
            {
                href: '/sales/orders',
                label: 'Sales Order',
                icon: FileText,
                color: 'text-rose-600',
                bg: 'bg-rose-50 dark:bg-rose-900/10',
                border: 'hover:border-rose-200 dark:hover:border-rose-800',
                resourceHint: '/sales',
            },
            {
                href: '/production/orders/create',
                label: 'SPK Baru',
                icon: Factory,
                color: 'text-blue-600',
                bg: 'bg-blue-50 dark:bg-blue-900/10',
                border: 'hover:border-blue-200 dark:hover:border-blue-800',
                resourceHint: '/production',
            },
            {
                href: '/dashboard/settings',
                label: 'Pengaturan',
                icon: Settings,
                color: 'text-zinc-600',
                bg: 'bg-zinc-50 dark:bg-zinc-900/10',
                border: 'hover:border-zinc-200 dark:hover:border-zinc-800',
                resourceHint: '/dashboard',
            },
        ],
        FINANCE: [
            {
                href: '/finance/payments/received',
                label: 'Terima Bayar',
                icon: Banknote,
                color: 'text-emerald-600',
                bg: 'bg-emerald-50 dark:bg-emerald-900/10',
                border: 'hover:border-emerald-200 dark:hover:border-emerald-800',
                resourceHint: '/finance',
            },
            {
                href: '/finance/payments/sent',
                label: 'Bayar Supplier',
                icon: CreditCard,
                color: 'text-cyan-600',
                bg: 'bg-cyan-50 dark:bg-cyan-900/10',
                border: 'hover:border-cyan-200 dark:hover:border-cyan-800',
                resourceHint: '/finance',
            },
            {
                href: '/finance/quick-entry',
                label: 'Quick Entry',
                icon: Plus,
                color: 'text-blue-600',
                bg: 'bg-blue-50 dark:bg-blue-900/10',
                border: 'hover:border-blue-200 dark:hover:border-blue-800',
                resourceHint: '/finance',
            },
            {
                href: '/finance/journals',
                label: 'Jurnal',
                icon: Receipt,
                color: 'text-violet-600',
                bg: 'bg-violet-50 dark:bg-violet-900/10',
                border: 'hover:border-violet-200 dark:hover:border-violet-800',
                resourceHint: '/finance',
            },
        ],
        SALES: [
            {
                href: '/sales/orders',
                label: 'SO Baru',
                icon: Plus,
                color: 'text-rose-600',
                bg: 'bg-rose-50 dark:bg-rose-900/10',
                border: 'hover:border-rose-200 dark:hover:border-rose-800',
                resourceHint: '/sales/orders',
            },
            {
                href: '/sales/deliveries',
                label: 'Surat Jalan',
                icon: Truck,
                color: 'text-blue-600',
                bg: 'bg-blue-50 dark:bg-blue-900/10',
                border: 'hover:border-blue-200 dark:hover:border-blue-800',
                resourceHint: '/sales/deliveries',
            },
            {
                href: '/sales/invoices',
                label: 'Invoice',
                icon: FileText,
                color: 'text-emerald-600',
                bg: 'bg-emerald-50 dark:bg-emerald-900/10',
                border: 'hover:border-emerald-200 dark:hover:border-emerald-800',
                resourceHint: '/sales/invoices',
            },
            {
                href: '/field/sales',
                label: 'Mode Mobile',
                icon: Smartphone,
                color: 'text-amber-600',
                bg: 'bg-amber-50 dark:bg-amber-900/10',
                border: 'hover:border-amber-200 dark:hover:border-amber-800',
                resourceHint: '/sales',
            },
        ],
        PROCUREMENT: [
            {
                href: '/purchasing/orders',
                label: 'PO Baru',
                icon: Plus,
                color: 'text-blue-600',
                bg: 'bg-blue-50 dark:bg-blue-900/10',
                border: 'hover:border-blue-200 dark:hover:border-blue-800',
                resourceHint: '/purchasing/orders',
            },
            {
                href: '/purchasing/requests',
                label: 'Purchase Request',
                icon: ClipboardList,
                color: 'text-amber-600',
                bg: 'bg-amber-50 dark:bg-amber-900/10',
                border: 'hover:border-amber-200 dark:hover:border-amber-800',
                resourceHint: '/purchasing/requests',
            },
            {
                href: '/warehouse/incoming',
                label: 'Terima Barang',
                icon: Package,
                color: 'text-emerald-600',
                bg: 'bg-emerald-50 dark:bg-emerald-900/10',
                border: 'hover:border-emerald-200 dark:hover:border-emerald-800',
                resourceHint: '/warehouse',
            },
            {
                href: '/purchasing/suppliers',
                label: 'Supplier',
                icon: Users,
                color: 'text-zinc-600',
                bg: 'bg-zinc-50 dark:bg-zinc-900/10',
                border: 'hover:border-zinc-200 dark:hover:border-zinc-800',
                resourceHint: '/purchasing/suppliers',
            },
        ],
        PLANNING: [
            {
                href: '/production/orders/create',
                label: 'SPK Baru',
                icon: Plus,
                color: 'text-blue-600',
                bg: 'bg-blue-50 dark:bg-blue-900/10',
                border: 'hover:border-blue-200 dark:hover:border-blue-800',
                resourceHint: '/production/orders',
            },
            {
                href: '/production/schedule',
                label: 'Jadwal',
                icon: CalendarClock,
                color: 'text-purple-600',
                bg: 'bg-purple-50 dark:bg-purple-900/10',
                border: 'hover:border-purple-200 dark:hover:border-purple-800',
                resourceHint: '/production/schedule',
            },
            {
                href: '/production/mrp',
                label: 'MRP',
                icon: ClipboardList,
                color: 'text-amber-600',
                bg: 'bg-amber-50 dark:bg-amber-900/10',
                border: 'hover:border-amber-200 dark:hover:border-amber-800',
                resourceHint: '/production/mrp',
            },
            {
                href: '/warehouse/materials',
                label: 'Bahan Produksi',
                icon: Package,
                color: 'text-emerald-600',
                bg: 'bg-emerald-50 dark:bg-emerald-900/10',
                border: 'hover:border-emerald-200 dark:hover:border-emerald-800',
                resourceHint: '/warehouse',
            },
        ],
        WAREHOUSE: [
            {
                href: '/warehouse/incoming',
                label: 'Penerimaan',
                icon: Package,
                color: 'text-blue-600',
                bg: 'bg-blue-50 dark:bg-blue-900/10',
                border: 'hover:border-blue-200 dark:hover:border-blue-800',
                resourceHint: '/warehouse',
            },
            {
                href: '/warehouse/outgoing',
                label: 'Pengeluaran',
                icon: Truck,
                color: 'text-emerald-600',
                bg: 'bg-emerald-50 dark:bg-emerald-900/10',
                border: 'hover:border-emerald-200 dark:hover:border-emerald-800',
                resourceHint: '/warehouse',
            },
            {
                href: '/warehouse/materials',
                label: 'Bahan Produksi',
                icon: ClipboardList,
                color: 'text-amber-600',
                bg: 'bg-amber-50 dark:bg-amber-900/10',
                border: 'hover:border-amber-200 dark:hover:border-amber-800',
                resourceHint: '/warehouse',
            },
            {
                href: '/warehouse/inventory',
                label: 'Lihat Stok',
                icon: Warehouse,
                color: 'text-purple-600',
                bg: 'bg-purple-50 dark:bg-purple-900/10',
                border: 'hover:border-purple-200 dark:hover:border-purple-800',
                resourceHint: '/warehouse',
            },
        ],
        PRODUCTION: [
            {
                href: '/kiosk',
                label: 'Kiosk Operator',
                icon: Factory,
                color: 'text-emerald-600',
                bg: 'bg-emerald-50 dark:bg-emerald-900/10',
                border: 'hover:border-emerald-200 dark:hover:border-emerald-800',
                resourceHint: '/kiosk',
            },
            {
                href: '/production/machines',
                label: 'Papan Mesin',
                icon: Factory,
                color: 'text-blue-600',
                bg: 'bg-blue-50 dark:bg-blue-900/10',
                border: 'hover:border-blue-200 dark:hover:border-blue-800',
                resourceHint: '/production',
            },
            {
                href: '/production/orders/create',
                label: 'SPK Baru',
                icon: Plus,
                color: 'text-amber-600',
                bg: 'bg-amber-50 dark:bg-amber-900/10',
                border: 'hover:border-amber-200 dark:hover:border-amber-800',
                resourceHint: '/production',
            },
            {
                href: '/production/daily',
                label: 'SPK Aktif',
                icon: ClipboardList,
                color: 'text-rose-600',
                bg: 'bg-rose-50 dark:bg-rose-900/10',
                border: 'hover:border-rose-200 dark:hover:border-rose-800',
                resourceHint: '/production',
            },
        ],
        HRD: [
            {
                href: '/hrd/attendance',
                label: 'Kehadiran',
                icon: ClipboardList,
                color: 'text-indigo-600',
                bg: 'bg-indigo-50 dark:bg-indigo-900/10',
                border: 'hover:border-indigo-200 dark:hover:border-indigo-800',
                resourceHint: '/hrd/attendance',
            },
            {
                href: '/hrd/payroll-monthly',
                label: 'Payroll Bulanan',
                icon: Banknote,
                color: 'text-emerald-600',
                bg: 'bg-emerald-50 dark:bg-emerald-900/10',
                border: 'hover:border-emerald-200 dark:hover:border-emerald-800',
                resourceHint: '/hrd/payroll-monthly',
            },
            {
                href: '/hrd/leave',
                label: 'Cuti',
                icon: ClipboardList,
                color: 'text-amber-600',
                bg: 'bg-amber-50 dark:bg-amber-900/10',
                border: 'hover:border-amber-200 dark:hover:border-amber-800',
                resourceHint: '/hrd/leave',
            },
            {
                href: '/dashboard/employees',
                label: 'Data Karyawan',
                icon: Users,
                color: 'text-blue-600',
                bg: 'bg-blue-50 dark:bg-blue-900/10',
                border: 'hover:border-blue-200 dark:hover:border-blue-800',
                resourceHint: '/dashboard/employees',
            },
        ],
    };

    return catalog[r] ?? catalog.ADMIN;
}

export function buildModuleShortcuts(
    activeModules?: string[],
): ModuleShortcut[] {
    const all: ModuleShortcut[] = [
        {
            href: '/sales',
            label: 'Sales',
            description: 'Order, kirim, invoice',
            icon: TrendingUp,
            iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
            iconColor: 'text-emerald-600 dark:text-emerald-400',
            resourceHint: '/sales',
        },
        {
            href: '/purchasing',
            label: 'Pembelian',
            description: 'PR, PO, supplier',
            icon: ShoppingCart,
            iconBg: 'bg-blue-100 dark:bg-blue-900/30',
            iconColor: 'text-blue-600 dark:text-blue-400',
            resourceHint: '/purchasing',
        },
        {
            href: '/production',
            label: 'Produksi',
            description: 'SPK, mesin, jadwal',
            icon: Factory,
            iconBg: 'bg-amber-100 dark:bg-amber-900/30',
            iconColor: 'text-amber-600 dark:text-amber-400',
            resourceHint: '/production',
        },
        {
            href: '/warehouse',
            label: 'Gudang',
            description: 'Stok, terima, muat',
            icon: Warehouse,
            iconBg: 'bg-purple-100 dark:bg-purple-900/30',
            iconColor: 'text-purple-600 dark:text-purple-400',
            resourceHint: '/warehouse',
        },
        {
            href: '/finance',
            label: 'Finance',
            description: 'AR/AP, jurnal, kas',
            icon: Wallet,
            iconBg: 'bg-cyan-100 dark:bg-cyan-900/30',
            iconColor: 'text-cyan-600 dark:text-cyan-400',
            resourceHint: '/finance',
        },
        {
            href: '/dashboard/products',
            label: 'Master Data',
            description: 'Produk, BOM, mesin',
            icon: Package,
            iconBg: 'bg-zinc-100 dark:bg-zinc-800',
            iconColor: 'text-zinc-600 dark:text-zinc-300',
            resourceHint: '/dashboard',
        },
    ];

    if (!activeModules || activeModules.length === 0) return all;

    const hrefModuleMap: Record<string, string> = {
        '/sales': 'SALES',
        '/purchasing': 'PURCHASING',
        '/production': 'PRODUCTION',
        '/warehouse': 'INVENTORY',
        '/finance': 'FINANCE',
    };

    return all.filter((s) => {
        const moduleKey = hrefModuleMap[s.href];
        if (!moduleKey) return true; // CORE items always shown
        return activeModules.includes(moduleKey);
    });
}

export function canAccessResource(
    permissions: string[] | 'ALL',
    resourceHint?: string,
): boolean {
    if (permissions === 'ALL') return true;
    if (!resourceHint) return true;
    return permissions.some(
        (p) =>
            p === resourceHint ||
            p.startsWith(`${resourceHint}/`) ||
            resourceHint.startsWith(`${p}/`) ||
            (p === '/kiosk' && resourceHint === '/kiosk'),
    );
}

export function roleDisplayName(role: DashboardRole): string {
    const map: Record<string, string> = {
        ADMIN: 'Admin',
        WAREHOUSE: 'Gudang',
        PRODUCTION: 'Produksi',
        SALES: 'Sales',
        PLANNING: 'Planning',
        FINANCE: 'Finance',
        PROCUREMENT: 'Pembelian',
        HRD: 'HRD',
    };
    return map[role.toUpperCase()] ?? role;
}

export function greetingForHour(hour: number): string {
    if (hour < 11) return 'Selamat pagi';
    if (hour < 15) return 'Selamat siang';
    if (hour < 18) return 'Selamat sore';
    return 'Selamat malam';
}

/**
 * Sapaan semangat humanis di header dashboard.
 * Rotasi harian (deterministik per tanggal + slot waktu) — tanpa AI,
 * biar cepat, offline-safe, dan tidak berubah-ubah dalam 1 sesi di jam yang sama.
 * Pool bisa diperluas nanti (termasuk personalisasi AI) tanpa ubah kontrak UI.
 */
const ENCOURAGEMENT_BY_PERIOD = {
    morning: [
        'Semangat pagi — langkah kecil yang rapi hari ini bikin alur kerja lebih enteng.',
        'Pagi yang baik! Yuk mulai dari prioritas terpenting dulu.',
        'Hari baru, energi baru. Satu tugas tuntas lebih berharga daripada sepuluh yang setengah.',
        'Selamat memulai. Tim butuh kehadiranmu yang fokus, bukan yang sempurna.',
        'Pagi produktif dimulai dari niat yang sederhana: bereskan yang penting dulu.',
        'Semangat! Kerja rapi hari ini = lebih sedikit drama besok.',
        'Kopi boleh menyusul — prioritas dulu. Kamu bisa.',
    ],
    afternoon: [
        'Siang masih panjang. Ambil napas, lanjutkan dengan tenang.',
        'Setengah hari sudah lewat — bagus. Sisa hari ini, satu kemenangan kecil lagi.',
        'Jangan biarkan tumpukan tugas mengaturmu. Atur urutannya, lalu kerjakan.',
        'Semangat siang. Cek dulu yang mendesak, sisanya bisa menunggu.',
        'Masih ada ruang untuk progres hari ini. Satu langkah saja sudah cukup.',
        'Siang yang baik untuk membereskan yang tertunda — pelan tapi pasti.',
        'Fokus di sisa hari: kualitas lebih dulu, buru-buru belakangan.',
    ],
    evening: [
        'Sore yang baik. Tutup hari dengan rapi, biar besok lebih ringan.',
        'Hampir selesai. Selesaikan yang bisa, sisakan yang harus menunggu.',
        'Semangat sore — kerja bagus yang konsisten mengalahkan sprint sesaat.',
        'Sore hari: saat yang pas merapikan, bukan memaksakan semuanya.',
        'Kamu sudah melewati banyak hari. Hari ini juga bisa dituntaskan dengan tenang.',
        'Sore produktif: cek ulang, konfirmasi, lalu istirahat dengan lega.',
        'Sedikit lagi. Tutup loop yang terbuka, biar kepala lebih lega malam ini.',
    ],
    night: [
        'Malam yang tenang. Kalau masih kerja, jaga tempo — jangan paksa.',
        'Semangat malam. Selesaikan yang perlu, sisanya untuk esok.',
        'Kerja malam boleh, tapi jangan lupa istirahat juga bagian dari produktivitas.',
        'Malam hari: fokus pada yang benar-benar penting, lalu cukupkan.',
        'Terima kasih sudah bertahan hari ini. Tutup dengan rapi, istirahat yang cukup.',
        'Kalau shift malam: satu langkah rapi lebih berharga daripada buru-buru.',
        'Malam yang baik. Progress kecil di jam sepi tetap progress.',
    ],
} as const;

function encouragementPeriod(
    hour: number,
): keyof typeof ENCOURAGEMENT_BY_PERIOD {
    if (hour < 11) return 'morning';
    if (hour < 15) return 'afternoon';
    if (hour < 18) return 'evening';
    return 'night';
}

/** Day-of-year 0–365 (non-leap aware enough for rotation). */
function dayOfYear(date: Date): number {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date.getTime() - start.getTime();
    return Math.floor(diff / 86_400_000);
}

/**
 * Generates a data-driven personal attention line for the dashboard header subtitle.
 */
export function personalAttentionLine(items: AttentionItem[]): string {
    if (!items || items.length === 0) {
        return 'Semua area operasional aman & lancar.';
    }

    const top = items[0];
    const topDetail =
        top.label.includes('·') || top.label.includes('(')
            ? top.label
            : `${top.label} (${top.count})`;

    if (items.length === 1) {
        return `Hari ini untukmu: 1 area perlu perhatian — teratas: ${topDetail}.`;
    }

    return `Hari ini untukmu: ${items.length} area perlu perhatian — teratas: ${topDetail}.`;
}

/**
 * Pilih 1 baris semangat untuk tanggal & jam tertentu.
 * Stabil dalam 1 hari di slot waktu yang sama; ganti otomatis keesokan harinya.
 */
export function encouragementForDate(date: Date = new Date()): string {
    const period = encouragementPeriod(date.getHours());
    const pool = ENCOURAGEMENT_BY_PERIOD[period];
    // Mix year + day + period salt so adjacent days & periods don't collide awkwardly
    const seed =
        date.getFullYear() * 1000 +
        dayOfYear(date) * 4 +
        ['morning', 'afternoon', 'evening', 'night'].indexOf(period);
    return pool[seed % pool.length]!;
}
