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
import { BUSINESS_TIMEZONE } from '@/lib/utils/timezone';
import { resolveMobileAlias } from '@/lib/mobile/mobile-portal-registry';

export type DashboardRole =
    | 'ADMIN'
    | 'WAREHOUSE'
    | 'PRODUCTION'
    | 'SALES'
    | 'PLANNING'
    | 'FINANCE'
    | 'PROCUREMENT'
    | string;

type KpiTrend = 'up' | 'down' | 'neutral';

export interface DashboardKpi {
    id: string;
    title: string;
    value: string;
    subtitle: string;
    icon: LucideIcon;
    trend?: KpiTrend;
    trendValue: string;
    progressValue?: number;
    progressColor?: string;
    unit: string;
    period: string;
    definition: string;
    source?: string;
    state?: 'AVAILABLE' | 'NOT_CONFIGURED';
    targetState?: 'NOT_CONFIGURED';
    href?: string;
    resourceHint?: string;
}

export interface DashboardAttentionItem {
    id: string;
    module: string;
    title: string;
    value: string;
    detail: string;
    severity: 'URGENT' | 'HIGH';
    href: string;
    resourceHint: string;
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

export interface PortalCta {
    href: string;
    title: string;
    description: string;
    ctaLabel: string;
    resourceHint: string;
}

function trendFromNumber(n: number | undefined): KpiTrend {
    if (n === undefined || n === 0) return 'neutral';
    return n > 0 ? 'up' : 'down';
}

function monthlyTrendLabel(n: number | undefined): string {
    // undefined = no prior-month data to compare against — distinct from a real 0% change.
    if (n === undefined) return 'Belum ada data pembanding bulan lalu';
    const direction = n > 0 ? 'Naik' : n < 0 ? 'Turun' : 'Tetap';
    return `${direction} ${Math.abs(n).toFixed(1)}% dibanding bulan lalu`;
}

/** Roles that land on ops portals by default — show compact dashboard + deep link */
export function isOpsPortalRole(role: DashboardRole): boolean {
    const r = role.toUpperCase();
    return r === 'WAREHOUSE' || r === 'PRODUCTION' || r === 'FACTORY_MANAGER';
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
            resourceHint: '/warehouse',
        };
    }
    if (r === 'PRODUCTION') {
        return {
            href: '/production',
            title: 'Portal Produksi',
            description:
                'Buka pulse lantai, antrean SPK, dan overview mesin shift ini.',
            ctaLabel: 'Buka Portal Produksi',
            resourceHint: '/production',
        };
    }
    if (r === 'HRD') {
        return {
            href: '/hrd',
            title: 'Portal HRD',
            description: 'Kehadiran, payroll, cuti, dan manajemen karyawan.',
            ctaLabel: 'Buka Portal HRD',
            resourceHint: '/hrd',
        };
    }
    if (r === 'FACTORY_MANAGER') {
        return {
            href: '/production/daily',
            title: 'Portal Produksi',
            description:
                'Pantau pencapaian SPK, jadwal, mesin, dan stok lantai.',
            ctaLabel: 'Buka Portal Produksi',
            resourceHint: '/production/daily',
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
    const available = (items: Array<DashboardKpi | null>) =>
        items.filter((item): item is DashboardKpi => item !== null);

    const revenueValue = stats.finance?.mtdRevenue ?? stats.sales?.mtdRevenue;
    const revenueTrend = stats.finance?.revenueTrend ?? stats.sales?.trend;
    const revenue: DashboardKpi | null =
        revenueValue !== null && revenueValue !== undefined
            ? {
                  id: 'revenue',
                  title: 'Pendapatan Aktual',
                  value: formatRupiah(revenueValue),
                  subtitle: 'Target belum tersedia',
                  targetState: 'NOT_CONFIGURED',
                  icon: Wallet,
                  trend: trendFromNumber(revenueTrend),
                  trendValue: monthlyTrendLabel(revenueTrend),
                  unit: 'IDR',
                  period: 'Bulan berjalan',
                  definition:
                      'Pendapatan usaha yang sudah tercatat. Perbandingan target menunggu target yang disetujui.',
                  source: 'Laporan laba rugi',
                  href: '/finance/reports/income-statement',
                  resourceHint: '/finance/reports/income-statement',
              }
            : null;

    const spending: DashboardKpi | null =
        stats.purchasing && stats.purchasing.mtdSpending !== null
            ? {
                  id: 'spending',
                  title: 'Pengeluaran',
                  value: formatRupiah(stats.purchasing.mtdSpending),
                  subtitle: `${stats.purchasing.pendingPOs} pesanan pembelian tertunda`,
                  icon: ShoppingCart,
                  trend: trendFromNumber(stats.purchasing.trend),
                  trendValue: monthlyTrendLabel(stats.purchasing.trend),
                  unit: 'IDR',
                  period: 'Bulan berjalan',
                  definition:
                      'Beban pokok penjualan ditambah beban operasional pada periode berjalan.',
                  source: 'Laporan laba rugi',
              }
            : null;

    const netIncome: DashboardKpi | null = stats.finance
        ? {
              id: 'netIncome',
              title: 'Laba Bersih',
              value: formatRupiah(stats.finance.mtdNetIncome),
              subtitle: 'Termasuk pendapatan dan beban lainnya',
              icon: Banknote,
              trend: trendFromNumber(stats.finance.netIncomeTrend),
              trendValue: monthlyTrendLabel(stats.finance.netIncomeTrend),
              unit: 'IDR',
              period: 'Bulan berjalan',
              definition:
                  'Laba bersih dari transaksi yang sudah tercatat pada periode berjalan.',
              source: 'Laporan laba rugi',
              href: '/finance/reports/income-statement',
              resourceHint: '/finance/reports/income-statement',
          }
        : null;

    const cashBalance: DashboardKpi | null =
        stats.finance &&
        stats.finance.cashBalance !== null &&
        stats.finance.cashAsOfDate !== null
            ? {
                  id: 'cashBalance',
                  title: 'Kas & Bank',
                  value: formatRupiah(stats.finance.cashBalance),
                  subtitle:
                      'Saldo akun yang ditandai sebagai kas dan bank',
                  icon: Wallet,
                  trendValue: 'Posisi saldo, bukan perubahan periode',
                  unit: 'IDR',
                  period: `Per ${stats.finance.cashAsOfDate} WIB`,
                  definition:
                      'Saldo debit bersih akun kas dan bank yang sudah tercatat sampai akhir hari bisnis.',
                  source: 'Neraca',
                  href: '/finance/reports/balance-sheet',
                  resourceHint: '/finance/reports/balance-sheet',
              }
            : null;

    // The available source data is a current-state count, not a utilization
    // percentage: execution hours exist, but machine capacity hours do not.
    const machines: DashboardKpi | null = stats.production
        ? {
              id: 'machines',
              title: 'Mesin Berjalan Saat Ini',
              value: `${stats.production!.runningMachines} dari ${stats.production!.totalMachines} mesin aktif`,
              subtitle: 'Kondisi saat dashboard diperbarui',
              icon: Factory,
              trendValue: 'Saat ini',
              unit: 'Mesin',
              period: 'Saat dashboard diperbarui',
              definition:
                  'Mesin aktif dengan status berjalan saat data diperbarui.',
              source: 'Produksi',
          }
        : null;

    const productionCompletion: DashboardKpi | null = stats.production
        ? {
              id: 'productionCompletion',
              title: 'Penyelesaian SPK',
              value: `${stats.production!.completionRate.toFixed(1)}%`,
              subtitle: 'SPK selesai dari seluruh SPK bulan berjalan',
              icon: Factory,
              trendValue: 'Berdasarkan jumlah dokumen SPK, bukan jumlah barang',
              progressValue: Math.min(100, stats.production!.completionRate),
              progressColor: 'bg-blue-600',
              unit: 'Persen dokumen SPK',
              period: 'Bulan berjalan',
              definition:
                  'Jumlah SPK selesai dibandingkan dengan seluruh SPK yang memenuhi syarat.',
              source: 'Produksi',
          }
        : null;

    const inventory: DashboardKpi | null = stats.inventory
        ? {
              id: 'inventory',
              title: 'Valuasi Stok',
              value: 'Belum dikonfigurasi',
              subtitle: `${stats.inventory!.lowStockCount} stok rendah · dasar biaya belum ditetapkan`,
              icon: Package,
              trendValue: 'Belum disiapkan',
              unit: 'IDR',
              period: 'Saat dashboard diperbarui',
              definition: 'Valuasi persediaan milik perusahaan.',
              source: 'Persediaan dan keuangan',
              state: 'NOT_CONFIGURED',
              href: '/warehouse/analytics',
              resourceHint: '/warehouse/analytics',
          }
        : null;

    const lowStock: DashboardKpi | null = stats.inventory
        ? {
              id: 'lowStock',
              title: 'Stok Rendah',
              value: stats.inventory!.lowStockCount.toString(),
              subtitle: `${stats.inventory!.totalItems.toLocaleString()} item total`,
              icon: Package,
              trend: stats.inventory!.lowStockCount > 0 ? 'down' : 'neutral',
              trendValue:
                  stats.inventory!.lowStockCount > 0
                      ? 'Perlu menambah stok'
                      : 'Aman',
              unit: 'Varian',
              period: 'Saat dashboard diperbarui',
              definition:
                  'Varian di bawah batas minimum pada lokasi bahan baku atau barang jadi internal.',
              source: 'Persediaan',
              href:
                  stats.inventory!.lowStockCount > 0
                      ? '/warehouse/inventory?lowStock=true'
                      : undefined,
              resourceHint: '/warehouse/inventory',
          }
        : null;

    const overdueAr: DashboardKpi | null = stats.finance
        ? {
              id: 'overdueAr',
              title: 'Piutang Jatuh Tempo',
              value: formatRupiah(stats.finance!.overdueReceivables),
              subtitle: `${stats.finance.overdueReceivablesCount} tagihan melewati jatuh tempo`,
              icon: TrendingUp,
              trend: stats.finance!.overdueReceivables > 0 ? 'down' : 'neutral',
              trendValue:
                  stats.finance!.overdueReceivables > 0
                      ? 'Tagih segera'
                      : 'Lancar',
              unit: 'IDR',
              period: 'Jatuh tempo sebelum hari bisnis ini',
              definition:
                  'Sisa piutang operasional yang belum lunas dan telah jatuh tempo.',
              source: 'Keuangan',
              href:
                  stats.finance!.overdueReceivables > 0
                      ? '/finance/invoices/sales?overdue=true'
                      : undefined,
              resourceHint: '/finance/invoices/sales',
          }
        : null;

    const overdueAp: DashboardKpi | null = stats.finance
        ? {
              id: 'overdueAp',
              title: 'Hutang Jatuh Tempo',
              value: formatRupiah(stats.finance!.overduePayables),
              subtitle: `${stats.finance!.invoicesDueThisWeek} jatuh tempo minggu ini`,
              icon: TrendingDown,
              trend: stats.finance!.overduePayables > 0 ? 'down' : 'neutral',
              trendValue:
                  stats.finance!.overduePayables > 0
                      ? 'Bayar segera'
                      : 'Lancar',
              unit: 'IDR',
              period: 'Jatuh tempo sebelum hari bisnis ini',
              definition:
                  'Sisa hutang yang belum lunas atau baru dibayar sebagian dan telah jatuh tempo.',
              source: 'Keuangan',
              href:
                  stats.finance!.overduePayables > 0
                      ? '/finance/invoices/purchase?overdue=true'
                      : undefined,
              resourceHint: '/finance/invoices/purchase',
          }
        : null;

    const activeOrders: DashboardKpi | null = stats.sales
        ? {
              id: 'activeOrders',
              title: 'Pesanan Aktif',
              value: stats.sales!.activeOrders.toString(),
              subtitle:
                  stats.sales!.pendingInvoices === null
                      ? 'Nominal keuangan tidak tersedia'
                      : `${stats.sales!.pendingInvoices} tagihan tertunda`,
              icon: FileText,
              trend: 'neutral',
              trendValue: 'Pesanan penjualan berjalan',
              unit: 'Pesanan',
              period: 'Bulan berjalan',
              definition: 'Pesanan penjualan pada tahap operasional aktif.',
              source: 'Penjualan',
              href:
                  stats.sales!.activeOrders > 0
                      ? '/sales/orders?status=CONFIRMED,IN_PRODUCTION,READY_TO_SHIP,SHIPPED'
                      : undefined,
              resourceHint: '/sales/orders',
          }
        : null;

    const pendingPo: DashboardKpi | null = stats.purchasing
        ? {
              id: 'pendingPo',
              title: 'Pesanan Pembelian Tertunda',
              value: stats.purchasing.pendingPOs.toString(),
              subtitle:
                  stats.purchasing.mtdSpending === null
                      ? 'Nominal keuangan tidak tersedia'
                      : formatRupiah(stats.purchasing.mtdSpending) +
                        ' pengeluaran bulan berjalan',
              icon: ShoppingCart,
              trend: stats.purchasing!.pendingPOs > 0 ? 'neutral' : 'up',
              trendValue:
                  stats.purchasing!.pendingPOs > 0
                      ? 'Perlu ditindaklanjuti'
                      : 'Antrian kosong',
              unit: 'Pesanan pembelian',
              period: 'Saat dashboard diperbarui',
              definition:
                  'Pesanan pembelian berstatus draf atau telah dikirim yang masih perlu ditindaklanjuti.',
              source: 'Pembelian',
              href:
                  stats.purchasing!.pendingPOs > 0
                      ? '/purchasing/orders?status=DRAFT,SENT'
                      : undefined,
              resourceHint: '/purchasing/orders',
          }
        : null;

    const activeJobs: DashboardKpi | null = stats.production
        ? {
              id: 'activeJobs',
              title: 'SPK Dirilis/Berjalan',
              value: stats.production!.activeJobs.toString(),
              subtitle: `${stats.production!.delayedJobs} terlambat`,
              icon: ClipboardList,
              trend: stats.production!.delayedJobs > 0 ? 'down' : 'neutral',
              trendValue:
                  stats.production!.delayedJobs > 0
                      ? 'Ada keterlambatan'
                      : 'Sesuai jadwal',
              unit: 'Dokumen SPK',
              period: 'Saat dashboard diperbarui',
              definition:
                  'SPK dirilis atau berjalan, dengan jumlah terlambat sebagai perhatian.',
              source: 'Produksi',
              href:
                  stats.production!.delayedJobs > 0
                      ? '/production/orders?late=1'
                      : undefined,
              resourceHint: '/production/orders',
          }
        : null;

    const downtime: DashboardKpi | null = stats.production
        ? {
              id: 'downtime',
              title: 'Waktu Henti',
              value: `${stats.production!.downtimeHours.toFixed(1)} jam`,
              subtitle: 'Durasi waktu henti mesin bulan berjalan',
              icon: Factory,
              trend: stats.production!.downtimeHours > 0 ? 'down' : 'neutral',
              trendValue:
                  stats.production!.downtimeHours > 0
                      ? 'Perlu pemantauan'
                      : 'Tidak ada waktu henti',
              unit: 'Jam',
              period: 'Bulan berjalan',
              definition: 'Durasi waktu henti mesin yang tercatat.',
              source: 'Produksi',
          }
        : null;

    switch (r) {
        case 'FINANCE':
            return available([
                revenue,
                netIncome,
                cashBalance,
                overdueAr,
                overdueAp,
            ]);
        case 'SALES':
            return available([activeOrders, revenue, overdueAr, inventory]);
        case 'PROCUREMENT':
            return available([pendingPo, spending, overdueAp, lowStock]);
        case 'PLANNING':
            return available([
                activeJobs,
                machines,
                productionCompletion,
                lowStock,
                activeOrders,
            ]);
        case 'WAREHOUSE':
            return available([lowStock, inventory, activeJobs, pendingPo]);
        case 'PRODUCTION':
            return available([
                machines,
                productionCompletion,
                activeJobs,
                downtime,
                lowStock,
            ]);
        case 'FACTORY_MANAGER':
            // Ops-only KPIs: never revenue, spending, or cash-pressure metrics.
            return available([
                activeJobs,
                machines,
                productionCompletion,
                downtime,
                lowStock,
            ]);
        case 'HRD':
            // HRD has its own portal dashboard (/hrd) with dedicated KPIs.
            // Generic dashboard shows only permission-filtered task shortcuts.
            return available([]);
        case 'ADMIN':
        default:
            return available([
                revenue,
                netIncome,
                cashBalance,
                productionCompletion,
                lowStock,
            ]);
    }
}

export function buildExecutiveAttention(
    role: DashboardRole,
    stats: ExecutiveStats,
): DashboardAttentionItem[] {
    const candidates: Record<string, DashboardAttentionItem | null> = {
        overdueAr:
            stats.finance && stats.finance.overdueReceivables > 0
                ? {
                      id: 'overdueAr',
                      module: 'Keuangan',
                      title: 'Piutang jatuh tempo',
                      value: formatRupiah(stats.finance.overdueReceivables),
                      detail: `${stats.finance.overdueReceivablesCount} tagihan melewati jatuh tempo`,
                      severity: 'URGENT',
                      href: '/finance/invoices/sales?overdue=true',
                      resourceHint: '/finance/invoices/sales',
                  }
                : null,
        overdueAp:
            stats.finance && stats.finance.overduePayables > 0
                ? {
                      id: 'overdueAp',
                      module: 'Keuangan · Pembelian',
                      title: 'Hutang jatuh tempo',
                      value: formatRupiah(stats.finance.overduePayables),
                      detail: `${stats.finance.overduePayablesCount} tagihan melewati jatuh tempo`,
                      severity: 'URGENT',
                      href: '/finance/invoices/purchase?overdue=true',
                      resourceHint: '/finance/invoices/purchase',
                  }
                : null,
        lowStock:
            stats.inventory && stats.inventory.lowStockCount > 0
                ? {
                      id: 'lowStock',
                      module: 'Persediaan',
                      title: 'Stok rendah',
                      value: stats.inventory.lowStockCount.toLocaleString(
                          'id-ID',
                      ),
                      detail:
                          'Varian bahan baku atau barang jadi internal di bawah batas minimum',
                      severity: 'URGENT',
                      href: '/warehouse/inventory?lowStock=true',
                      resourceHint: '/warehouse/inventory',
                  }
                : null,
        delayedProduction:
            stats.production && stats.production.delayedJobs > 0
                ? {
                      id: 'delayedProduction',
                      module: 'Produksi',
                      title: 'SPK terlambat',
                      value: stats.production.delayedJobs.toLocaleString(
                          'id-ID',
                      ),
                      detail:
                          'Dokumen dirilis atau berjalan melewati tanggal selesai rencana',
                      severity: 'HIGH',
                      href: '/production/orders?late=1',
                      resourceHint: '/production/orders',
                  }
                : null,
        pendingPo:
            stats.purchasing && stats.purchasing.pendingPOs > 0
                ? {
                      id: 'pendingPo',
                      module: 'Pembelian',
                      title: 'Pesanan pembelian perlu ditindaklanjuti',
                      value: stats.purchasing.pendingPOs.toLocaleString(
                          'id-ID',
                      ),
                      detail: 'Pesanan pembelian berstatus draf atau telah dikirim',
                      severity: 'HIGH',
                      href: '/purchasing/orders?status=DRAFT,SENT',
                      resourceHint: '/purchasing/orders',
                  }
                : null,
    };
    const byRole: Record<string, string[]> = {
        ADMIN: [
            'overdueAr',
            'overdueAp',
            'lowStock',
            'delayedProduction',
            'pendingPo',
        ],
        FINANCE: ['overdueAr', 'overdueAp'],
        SALES: ['overdueAr', 'lowStock'],
        MARKETING: ['overdueAr', 'lowStock'],
        PROCUREMENT: ['overdueAp', 'lowStock', 'pendingPo'],
        PLANNING: ['lowStock', 'delayedProduction', 'pendingPo'],
        WAREHOUSE: ['lowStock', 'delayedProduction', 'pendingPo'],
        PRODUCTION: ['lowStock', 'delayedProduction'],
        FACTORY_MANAGER: ['lowStock', 'delayedProduction'],
        HRD: [],
    };

    return (byRole[role.toUpperCase()] ?? byRole.ADMIN)
        .map((id) => candidates[id])
        .filter((item): item is DashboardAttentionItem => item !== null)
        .slice(0, 5);
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
                resourceHint: '/dashboard/products/create',
            },
            {
                href: '/sales/orders',
                label: 'Pesanan Penjualan',
                icon: FileText,
                color: 'text-rose-600',
                bg: 'bg-rose-50 dark:bg-rose-900/10',
                border: 'hover:border-rose-200 dark:hover:border-rose-800',
                resourceHint: '/sales/orders',
            },
            {
                href: '/production/orders/create',
                label: 'SPK Baru',
                icon: Factory,
                color: 'text-blue-600',
                bg: 'bg-blue-50 dark:bg-blue-900/10',
                border: 'hover:border-blue-200 dark:hover:border-blue-800',
                resourceHint: '/production/orders/create',
            },
            {
                href: '/dashboard/settings',
                label: 'Pengaturan',
                icon: Settings,
                color: 'text-zinc-600',
                bg: 'bg-zinc-50 dark:bg-zinc-900/10',
                border: 'hover:border-zinc-200 dark:hover:border-zinc-800',
                resourceHint: '/dashboard/settings',
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
                resourceHint: '/finance/payments/received',
            },
            {
                href: '/finance/payments/sent',
                label: 'Bayar Supplier',
                icon: CreditCard,
                color: 'text-cyan-600',
                bg: 'bg-cyan-50 dark:bg-cyan-900/10',
                border: 'hover:border-cyan-200 dark:hover:border-cyan-800',
                resourceHint: '/finance/payments/sent',
            },
            {
                href: '/finance/quick-entry',
                label: 'Quick Entry',
                icon: Plus,
                color: 'text-blue-600',
                bg: 'bg-blue-50 dark:bg-blue-900/10',
                border: 'hover:border-blue-200 dark:hover:border-blue-800',
                resourceHint: '/finance/quick-entry',
            },
            {
                href: '/finance/journals',
                label: 'Jurnal',
                icon: Receipt,
                color: 'text-violet-600',
                bg: 'bg-violet-50 dark:bg-violet-900/10',
                border: 'hover:border-violet-200 dark:hover:border-violet-800',
                resourceHint: '/finance/journals',
            },
        ],
        SALES: [
            {
                href: '/sales/orders/create',
                label: 'SO Baru',
                icon: Plus,
                color: 'text-rose-600',
                bg: 'bg-rose-50 dark:bg-rose-900/10',
                border: 'hover:border-rose-200 dark:hover:border-rose-800',
                resourceHint: '/sales/orders/create',
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
                resourceHint: '/field/sales',
            },
        ],
        PROCUREMENT: [
            {
                href: '/purchasing/orders/create',
                label: 'PO Baru',
                icon: Plus,
                color: 'text-blue-600',
                bg: 'bg-blue-50 dark:bg-blue-900/10',
                border: 'hover:border-blue-200 dark:hover:border-blue-800',
                resourceHint: '/purchasing/orders/create',
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
                resourceHint: '/warehouse/incoming',
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
                resourceHint: '/production/orders/create',
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
                resourceHint: '/warehouse/materials',
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
                resourceHint: '/warehouse/incoming',
            },
            {
                href: '/warehouse/outgoing',
                label: 'Pengeluaran',
                icon: Truck,
                color: 'text-emerald-600',
                bg: 'bg-emerald-50 dark:bg-emerald-900/10',
                border: 'hover:border-emerald-200 dark:hover:border-emerald-800',
                resourceHint: '/warehouse/outgoing',
            },
            {
                href: '/warehouse/materials',
                label: 'Bahan Produksi',
                icon: ClipboardList,
                color: 'text-amber-600',
                bg: 'bg-amber-50 dark:bg-amber-900/10',
                border: 'hover:border-amber-200 dark:hover:border-amber-800',
                resourceHint: '/warehouse/materials',
            },
            {
                href: '/warehouse/inventory',
                label: 'Lihat Stok',
                icon: Warehouse,
                color: 'text-purple-600',
                bg: 'bg-purple-50 dark:bg-purple-900/10',
                border: 'hover:border-purple-200 dark:hover:border-purple-800',
                resourceHint: '/warehouse/inventory',
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
                resourceHint: '/production/machines',
            },
            {
                href: '/production/orders/create',
                label: 'SPK Baru',
                icon: Plus,
                color: 'text-amber-600',
                bg: 'bg-amber-50 dark:bg-amber-900/10',
                border: 'hover:border-amber-200 dark:hover:border-amber-800',
                resourceHint: '/production/orders/create',
            },
            {
                href: '/production/daily',
                label: 'SPK Aktif',
                icon: ClipboardList,
                color: 'text-rose-600',
                bg: 'bg-rose-50 dark:bg-rose-900/10',
                border: 'hover:border-rose-200 dark:hover:border-rose-800',
                resourceHint: '/production/daily',
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
        FACTORY_MANAGER: [
            {
                href: '/production/output-report',
                label: 'Pencapaian SPK',
                icon: FileText,
                color: 'text-blue-600',
                bg: 'bg-blue-50 dark:bg-blue-900/10',
                border: 'hover:border-blue-200 dark:hover:border-blue-800',
                resourceHint: '/production/output-report',
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
                href: '/production/machines',
                label: 'Papan Mesin',
                icon: Factory,
                color: 'text-emerald-600',
                bg: 'bg-emerald-50 dark:bg-emerald-900/10',
                border: 'hover:border-emerald-200 dark:hover:border-emerald-800',
                resourceHint: '/production/machines',
            },
            {
                href: '/production/inventory',
                label: 'Stok Lantai',
                icon: Package,
                color: 'text-amber-600',
                bg: 'bg-amber-50 dark:bg-amber-900/10',
                border: 'hover:border-amber-200 dark:hover:border-amber-800',
                resourceHint: '/production/inventory',
            },
        ],
    };

    return catalog[r] ?? catalog.ADMIN;
}

export function canAccessResource(
    permissions: string[] | 'ALL',
    resourceHint?: string,
): boolean {
    if (permissions === 'ALL') return true;
    if (!resourceHint) return true;

    const canonicalResource = resolveMobileAlias(resourceHint);
    return permissions.some((permission) => {
        const canonicalPermission = resolveMobileAlias(permission);
        return (
            canonicalPermission === canonicalResource ||
            canonicalResource.startsWith(`${canonicalPermission}/`)
        );
    });
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
        FACTORY_MANAGER: 'Kepala Pabrik',
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

/** Day-of-year 1–366 for deterministic message rotation. */
function dayOfYear(year: number, month: number, day: number): number {
    const start = Date.UTC(year, 0, 0);
    const current = Date.UTC(year, month - 1, day);
    return Math.floor((current - start) / 86_400_000);
}

function encouragementForCalendarDate(
    year: number,
    month: number,
    day: number,
    hour: number,
): string {
    const period = encouragementPeriod(hour);
    const pool = ENCOURAGEMENT_BY_PERIOD[period];
    const seed =
        year * 1000 +
        dayOfYear(year, month, day) * 4 +
        ['morning', 'afternoon', 'evening', 'night'].indexOf(period);
    return pool[seed % pool.length]!;
}

/**
 * Pilih 1 baris semangat untuk tanggal & jam tertentu.
 * Stabil dalam 1 hari di slot waktu yang sama; ganti otomatis keesokan harinya.
 */
export function encouragementForDate(date: Date = new Date()): string {
    return encouragementForCalendarDate(
        date.getFullYear(),
        date.getMonth() + 1,
        date.getDate(),
        date.getHours(),
    );
}

export interface DashboardPresentation {
    currentDate: string;
    greeting: string;
    encouragement: string;
    lastUpdated: string;
}

/** Build one server-owned dashboard snapshot in the business timezone. */
export function getDashboardPresentation(
    date: Date = new Date(),
): DashboardPresentation {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: BUSINESS_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(date);
    const getPart = (type: Intl.DateTimeFormatPartTypes) =>
        Number(parts.find((part) => part.type === type)?.value);
    const year = getPart('year');
    const month = getPart('month');
    const day = getPart('day');
    const hour = getPart('hour');

    return {
        currentDate: new Intl.DateTimeFormat('id-ID', {
            timeZone: BUSINESS_TIMEZONE,
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        }).format(date),
        greeting: greetingForHour(hour),
        encouragement: encouragementForCalendarDate(year, month, day, hour),
        lastUpdated: new Intl.DateTimeFormat('id-ID', {
            timeZone: BUSINESS_TIMEZONE,
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
            timeZoneName: 'short',
        }).format(date),
    };
}
