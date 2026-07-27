'use client';

import { useState, useTransition, useRef } from 'react';
import {
    UsageAnalyticsOverviewData,
    UsageAnalyticsFilter,
} from '@/services/admin/usage-analytics.service';
import { fetchUsageAnalytics } from '@/actions/admin/usage-analytics';
import {
    BarChart3,
    Users,
    Building2,
    Layers,
    TrendingUp,
    TrendingDown,
    Calendar,
    Filter,
    Download,
    RefreshCw,
    Activity,
    AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils/utils';

interface Props {
    initialData: UsageAnalyticsOverviewData;
}

export function UsageAnalyticsClient({ initialData }: Props) {
    const [data, setData] = useState<UsageAnalyticsOverviewData>(initialData);
    const [isPending, startTransition] = useTransition();
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const [range, setRange] = useState<'today' | 'yesterday' | '7d' | '30d'>('7d');
    const [tenantId, setTenantId] = useState<string>('all');
    const [moduleKey, setModuleKey] = useState<string>('all');

    // Sequence counter to prevent async race condition when changing filters rapidly (Finding 13)
    const requestSequenceRef = useRef(0);

    const handleApplyFilters = (
        newRange: 'today' | 'yesterday' | '7d' | '30d',
        newTenant: string,
        newModule: string,
    ) => {
        setRange(newRange);
        setTenantId(newTenant);
        setModuleKey(newModule);
        setErrorMsg(null);

        const currentSeq = ++requestSequenceRef.current;

        startTransition(async () => {
            try {
                const filter: UsageAnalyticsFilter = {
                    range: newRange,
                    tenantId: newTenant,
                    moduleKey: newModule,
                };
                const updated = await fetchUsageAnalytics(filter);

                // Only apply state if this request is the latest triggered sequence
                if (currentSeq === requestSequenceRef.current) {
                    setData(updated);
                }
            } catch (err) {
                if (currentSeq === requestSequenceRef.current) {
                    setErrorMsg(
                        err instanceof Error
                            ? err.message
                            : 'Gagal memperbarui data analytics.',
                    );
                }
            }
        });
    };

    const handleExportCsv = () => {
        // Escaping double quotes safely for CSV format (Finding 16)
        const rows = [
            ['Feature Key', 'Label', 'Module', 'Total Views', 'Unique Users', 'Unique Tenants', 'Change %'],
            ...data.topFeatures.map((f) => [
                `"${f.featureKey.replace(/"/g, '""')}"`,
                `"${f.label.replace(/"/g, '""')}"`,
                `"${f.moduleKey.replace(/"/g, '""')}"`,
                f.totalViews.toString(),
                f.uniqueUsers.toString(),
                f.uniqueTenants.toString(),
                `${f.changePercent}%`,
            ]),
        ];
        const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `usage-analytics-top25-${range}-${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const renderTrendBadge = (changePercent: number) => {
        const isPositive = changePercent >= 0;
        return (
            <span
                className={cn(
                    'inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border',
                    isPositive
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
                )}
            >
                {isPositive ? (
                    <TrendingUp className="h-3 w-3" />
                ) : (
                    <TrendingDown className="h-3 w-3" />
                )}
                {isPositive ? `+${changePercent}%` : `${changePercent}%`}
            </span>
        );
    };

    return (
        <div className="space-y-6 pb-12">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
                <div>
                    <div className="flex items-center gap-2">
                        <BarChart3 className="h-7 w-7 text-red-500" />
                        <h1 className="text-2xl font-bold tracking-tight text-foreground">
                            Super Admin Usage Analytics
                        </h1>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                        Agregat adopsi fitur, tren pengguna aktif, dan penetrasi tenant Polyflow.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={handleExportCsv}
                        className="inline-flex items-center gap-2 text-sm font-medium border border-border bg-card hover:bg-muted px-3.5 py-2 rounded-lg transition-colors shadow-sm"
                        title="Ekspor daftar fitur teratas ke CSV"
                    >
                        <Download className="h-4 w-4 text-muted-foreground" />
                        Export CSV (Top 25)
                    </button>
                    <button
                        onClick={() => handleApplyFilters(range, tenantId, moduleKey)}
                        disabled={isPending}
                        className="inline-flex items-center gap-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors shadow-sm disabled:opacity-50"
                    >
                        <RefreshCw className={cn('h-4 w-4', isPending && 'animate-spin')} />
                        {isPending ? 'Memuat...' : 'Refresh'}
                    </button>
                </div>
            </div>

            {errorMsg && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{errorMsg}</span>
                </div>
            )}

            {/* Filter Bar */}
            <div className="p-4 rounded-xl bg-card border border-border shadow-sm space-y-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    <Filter className="h-3.5 w-3.5" />
                    <span>Filter & Periode Laporan</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Time Range Pills */}
                    <div>
                        <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                            Rentang Waktu
                        </label>
                        <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg border border-border">
                            {(['today', 'yesterday', '7d', '30d'] as const).map((r) => (
                                <button
                                    key={r}
                                    disabled={isPending}
                                    onClick={() => handleApplyFilters(r, tenantId, moduleKey)}
                                    className={cn(
                                        'flex-1 text-xs font-medium py-1.5 px-2 rounded-md transition-colors capitalize disabled:opacity-60',
                                        range === r
                                            ? 'bg-background text-foreground shadow-sm font-semibold'
                                            : 'text-muted-foreground hover:text-foreground',
                                    )}
                                >
                                    {r === 'today'
                                        ? 'Hari Ini'
                                        : r === 'yesterday'
                                          ? 'Kemarin'
                                          : r === '7d'
                                            ? '7 Hari'
                                            : '30 Hari'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Tenant Dropdown */}
                    <div>
                        <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                            Tenant
                        </label>
                        <select
                            value={tenantId}
                            disabled={isPending}
                            onChange={(e) => handleApplyFilters(range, e.target.value, moduleKey)}
                            className="w-full text-xs font-medium bg-background border border-border rounded-lg p-2 focus:ring-1 focus:ring-red-500 focus:outline-none disabled:opacity-60"
                        >
                            <option value="all">Semua Tenant ({data.availableTenants.length})</option>
                            {data.availableTenants.map((t) => (
                                <option key={t.id} value={t.id}>
                                    {t.name} ({t.subdomain})
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Module Dropdown */}
                    <div>
                        <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                            Modul Fitur
                        </label>
                        <select
                            value={moduleKey}
                            disabled={isPending}
                            onChange={(e) => handleApplyFilters(range, tenantId, e.target.value)}
                            className="w-full text-xs font-medium bg-background border border-border rounded-lg p-2 focus:ring-1 focus:ring-red-500 focus:outline-none capitalize disabled:opacity-60"
                        >
                            <option value="all">Semua Modul</option>
                            {data.availableModules.map((m) => (
                                <option key={m} value={m}>
                                    Modul {m}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Active Range Label */}
                    <div className="flex flex-col justify-end">
                        <div
                            className="text-xs text-muted-foreground bg-muted/40 p-2 rounded-lg border border-border flex items-center justify-between"
                            title="Rentang kustom maksimal 90 hari sesuai kebijakan retensi event mentah."
                        >
                            <span className="flex items-center gap-1.5 font-medium">
                                <Calendar className="h-3.5 w-3.5 text-red-500" />
                                {data.periodLabel}
                            </span>
                            <span className="text-[10px] bg-red-500/10 text-red-600 px-2 py-0.5 rounded-full font-bold">
                                Asia/Jakarta (Max 90D)
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Active Users */}
                <div className="p-5 rounded-xl bg-card border border-border shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Pengguna Aktif
                        </span>
                        <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                            <Users className="h-4 w-4" />
                        </div>
                    </div>
                    <div className="flex items-baseline justify-between">
                        <span className="text-3xl font-bold tracking-tight text-foreground">
                            {data.metrics.activeUsers.value.toLocaleString()}
                        </span>
                        {renderTrendBadge(data.metrics.activeUsers.changePercent)}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                        Pengguna unik yang mengakses fitur dalam periode
                    </p>
                </div>

                {/* Active Tenants */}
                <div className="p-5 rounded-xl bg-card border border-border shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Tenant Aktif
                        </span>
                        <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500">
                            <Building2 className="h-4 w-4" />
                        </div>
                    </div>
                    <div className="flex items-baseline justify-between">
                        <span className="text-3xl font-bold tracking-tight text-foreground">
                            {data.metrics.activeTenants.value.toLocaleString()}
                        </span>
                        {renderTrendBadge(data.metrics.activeTenants.changePercent)}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                        Tenant dengan minimal 1 kali akses fitur
                    </p>
                </div>

                {/* Total Feature Views */}
                <div className="p-5 rounded-xl bg-card border border-border shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Total Akses Fitur
                        </span>
                        <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                            <Activity className="h-4 w-4" />
                        </div>
                    </div>
                    <div className="flex items-baseline justify-between">
                        <span className="text-3xl font-bold tracking-tight text-foreground">
                            {data.metrics.totalViews.value.toLocaleString()}
                        </span>
                        {renderTrendBadge(data.metrics.totalViews.changePercent)}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                        Total navigasi FEATURE_VIEW berhasil
                    </p>
                </div>

                {/* Distinct Features Used */}
                <div className="p-5 rounded-xl bg-card border border-border shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Fitur Digunakan
                        </span>
                        <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                            <Layers className="h-4 w-4" />
                        </div>
                    </div>
                    <div className="flex items-baseline justify-between">
                        <span className="text-3xl font-bold tracking-tight text-foreground">
                            {data.metrics.featuresUsed.value.toLocaleString()}
                        </span>
                        {renderTrendBadge(data.metrics.featuresUsed.changePercent)}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                        Jumlah entri registry fitur unik yang dipakai
                    </p>
                </div>
            </div>

            {/* Daily Trend Visualization */}
            {data.dailyTrends.length > 0 && (
                <div className="p-5 rounded-xl bg-card border border-border shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Activity className="h-4 w-4 text-red-500" />
                            <h3 className="font-semibold text-sm text-foreground">
                                Tren Aktivitas Harian (Asia/Jakarta)
                            </h3>
                        </div>
                        <span className="text-xs text-muted-foreground">
                            Total views & pengguna per hari
                        </span>
                    </div>

                    <div className="h-44 flex items-end gap-2 pt-6 pb-2 border-b border-border">
                        {data.dailyTrends.map((pt) => {
                            const maxViews = Math.max(...data.dailyTrends.map((d) => d.totalViews), 1);
                            const heightPercent = Math.max(Math.round((pt.totalViews / maxViews) * 100), 8);
                            return (
                                <div key={pt.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                                    {/* Tooltip */}
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-12 z-20 bg-zinc-900 text-white text-[10px] p-2 rounded shadow-lg whitespace-nowrap pointer-events-none">
                                        <div className="font-bold">{pt.date}</div>
                                        <div>{pt.totalViews} views • {pt.activeUsers} user</div>
                                    </div>

                                    <div
                                        style={{ height: `${heightPercent}%` }}
                                        className="w-full bg-red-500/80 group-hover:bg-red-600 rounded-t transition-all"
                                    />
                                    <span className="text-[10px] text-muted-foreground truncate w-full text-center">
                                        {pt.date.slice(5)}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Main Content Grid: Top Features & Tenant Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top Features */}
                <div className="p-5 rounded-xl bg-card border border-border shadow-sm space-y-4">
                    <div className="flex items-center justify-between border-b border-border pb-3">
                        <div>
                            <h3 className="font-semibold text-sm text-foreground">
                                Fitur Paling Banyak Digunakan
                            </h3>
                            <p className="text-xs text-muted-foreground">
                                Peringkat berdasarkan total views dan penggunanya
                            </p>
                        </div>
                        <span className="text-xs bg-muted px-2.5 py-1 rounded-full font-medium text-muted-foreground">
                            Top 25
                        </span>
                    </div>

                    {data.topFeatures.length === 0 ? (
                        <div className="py-12 text-center text-muted-foreground text-xs">
                            Belum ada data aktivitas fitur pada periode ini.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead>
                                    <tr className="border-b border-border text-muted-foreground font-semibold">
                                        <th className="pb-2">Fitur / Halaman</th>
                                        <th className="pb-2">Modul</th>
                                        <th className="pb-2 text-right">Views</th>
                                        <th className="pb-2 text-right">User</th>
                                        <th className="pb-2 text-right">Tenant</th>
                                        <th className="pb-2 text-right">Tren</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/60">
                                    {data.topFeatures.map((f, i) => (
                                        <tr key={f.featureKey} className="hover:bg-muted/40 transition-colors">
                                            <td className="py-2.5 font-medium pr-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-bold text-muted-foreground w-4">
                                                        #{i + 1}
                                                    </span>
                                                    <div>
                                                        <div className="font-semibold text-foreground">
                                                            {f.label}
                                                        </div>
                                                        <div className="text-[10px] text-muted-foreground font-mono">
                                                            {f.featureKey}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-2.5 capitalize">
                                                <span className="bg-muted px-2 py-0.5 rounded text-[10px] font-medium text-muted-foreground">
                                                    {f.moduleKey}
                                                </span>
                                            </td>
                                            <td className="py-2.5 text-right font-bold text-foreground">
                                                {f.totalViews.toLocaleString()}
                                            </td>
                                            <td className="py-2.5 text-right text-muted-foreground">
                                                {f.uniqueUsers}
                                            </td>
                                            <td className="py-2.5 text-right text-muted-foreground">
                                                {f.uniqueTenants}
                                            </td>
                                            <td className="py-2.5 text-right">
                                                {renderTrendBadge(f.changePercent)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Tenant Adoption */}
                <div className="p-5 rounded-xl bg-card border border-border shadow-sm space-y-4">
                    <div className="flex items-center justify-between border-b border-border pb-3">
                        <div>
                            <h3 className="font-semibold text-sm text-foreground">
                                Ringkasan Adopsi Per Tenant
                            </h3>
                            <p className="text-xs text-muted-foreground">
                                Aktivitas dan variasi fitur yang digunakan tiap tenant
                            </p>
                        </div>
                        <span className="text-xs bg-muted px-2.5 py-1 rounded-full font-medium text-muted-foreground">
                            {data.tenantSummaries.length} Tenant
                        </span>
                    </div>

                    {data.tenantSummaries.length === 0 ? (
                        <div className="py-12 text-center text-muted-foreground text-xs">
                            Belum ada tenant aktif pada periode ini.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead>
                                    <tr className="border-b border-border text-muted-foreground font-semibold">
                                        <th className="pb-2">Nama Tenant</th>
                                        <th className="pb-2 text-right">User</th>
                                        <th className="pb-2 text-right">Fitur</th>
                                        <th className="pb-2 text-right">Total Views</th>
                                        <th className="pb-2 text-right">Terakhir Aktif (WIB)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/60">
                                    {data.tenantSummaries.map((t) => (
                                        <tr key={t.tenantId} className="hover:bg-muted/40 transition-colors">
                                            <td className="py-2.5 font-medium">
                                                <div className="font-semibold text-foreground">
                                                    {t.tenantName}
                                                </div>
                                                <div className="text-[10px] text-muted-foreground font-mono">
                                                    {t.subdomain}
                                                </div>
                                            </td>
                                            <td className="py-2.5 text-right font-semibold text-foreground">
                                                {t.activeUsers}
                                            </td>
                                            <td className="py-2.5 text-right text-muted-foreground">
                                                {t.featuresUsed}
                                            </td>
                                            <td className="py-2.5 text-right font-bold text-foreground">
                                                {t.totalViews.toLocaleString()}
                                            </td>
                                            <td className="py-2.5 text-right text-[10px] text-muted-foreground">
                                                {t.lastActivity
                                                    ? new Date(t.lastActivity).toLocaleTimeString('id-ID', {
                                                          timeZone: 'Asia/Jakarta',
                                                          hour: '2-digit',
                                                          minute: '2-digit',
                                                      })
                                                    : '-'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
