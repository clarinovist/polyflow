'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    DashboardFreshness,
    DashboardHealthCard,
    DashboardSectionState,
} from '@/components/dashboard/DashboardMetricPrimitives';
import { type ExecutiveStats } from '@/services/dashboard/executive-stats-service';
import { formatRupiah } from '@/lib/utils/utils';
import { dashboardLabels } from '@/lib/labels';
import {
    buildExecutiveAttention,
    buildKpis,
    buildQuickActions,
    canAccessResource,
    canSeeExecutiveChart,
    getPortalCta,
    isOpsPortalRole,
    roleDisplayName,
    type DashboardAttentionItem,
    type DashboardKpi,
    type DashboardPresentation,
    type DashboardRole,
    type QuickActionItem,
} from '@/lib/dashboard/role-dashboard-config';
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    Line,
    XAxis,
    YAxis,
    Tooltip,
} from 'recharts';
import { TrendingUp, ArrowRight, AlertCircle, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { cn } from '@/lib/utils/utils';

const SECTION_LABELS = {
    sales: 'Sales',
    purchasing: 'Pembelian',
    production: 'Produksi',
    inventory: 'Persediaan',
    finance: 'Finance',
} as const;

interface DashboardClientProps {
    stats: ExecutiveStats | null;
    userName: string;
    userRole: string;
    permissions: string[] | 'ALL';
    activeModules?: string[];
    presentation: DashboardPresentation;
}

export default function DashboardClient({
    stats,
    userName,
    userRole,
    permissions,
    presentation,
}: DashboardClientProps) {
    const router = useRouter();
    const [isRefreshing, startRefreshTransition] = useTransition();

    const role = (userRole || 'ADMIN') as DashboardRole;
    const opsCompact = isOpsPortalRole(role);
    const portalCta = getPortalCta(role);
    const visiblePortalCta =
        portalCta && canAccessResource(permissions, portalCta.resourceHint)
            ? portalCta
            : null;
    const showChart = canSeeExecutiveChart(role) && !opsCompact;

    const handleRefresh = () => {
        startRefreshTransition(() => {
            router.refresh();
        });
    };

    const { currentDate, greeting, encouragement } = presentation;
    const firstName = userName.split(' ')[0] || userName;

    if (!stats) {
        return (
            <div className="p-4 md:p-6 lg:p-8 flex flex-col items-center justify-center min-h-[50vh] space-y-4">
                <AlertCircle className="w-12 h-12 text-muted-foreground/50" />
                <h1 className="text-xl font-semibold">
                    {dashboardLabels.loadFailed}
                </h1>
                <Button
                    variant="outline"
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                >
                    <RefreshCw
                        className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`}
                    />
                    {dashboardLabels.tryAgain}
                </Button>
            </div>
        );
    }

    const unavailableSections = Object.entries(stats.sections)
        .filter(([, state]) => state === 'UNAVAILABLE')
        .map(([key]) => SECTION_LABELS[key as keyof typeof SECTION_LABELS]);
    const kpis = buildKpis(role, stats).filter((kpi) =>
        canAccessResource(permissions, kpi.resourceHint),
    );
    const attention = buildExecutiveAttention(role, stats).filter((item) =>
        canAccessResource(permissions, item.resourceHint),
    );
    const quickActions = buildQuickActions(role).filter((a) =>
        canAccessResource(permissions, a.resourceHint),
    );
    const revenueDriver = stats.finance?.revenueTrendChart ?? [];
    const netIncomeDriver = stats.finance?.netIncomeTrendChart ?? [];
    const alignedDrivers =
        revenueDriver.length >= 4 &&
        revenueDriver.length === netIncomeDriver.length &&
        revenueDriver.every(
            (point, index) => point.month === netIncomeDriver[index]?.month,
        );
    const driverData = alignedDrivers
        ? revenueDriver.map((point, index) => ({
              ...point,
              netIncome: netIncomeDriver[index]!.netIncome,
          }))
        : null;
    const showDrivers = showChart && driverData !== null;
    return (
        <div className="space-y-6 md:space-y-8 animate-in fade-in duration-500 max-w-[1600px] mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                        <Badge variant="secondary" className="font-medium">
                            {roleDisplayName(role)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                            {currentDate}
                        </span>
                    </div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                        {greeting}, {firstName}
                    </h1>
                    <p className="text-sm md:text-base text-muted-foreground mt-1 max-w-xl">
                        {encouragement}
                    </p>
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                        aria-label={dashboardLabels.refreshDashboard}
                        className="gap-2 h-9"
                    >
                        <RefreshCw
                            className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
                        />
                        <span className="hidden sm:inline text-xs">
                            {dashboardLabels.refresh}
                        </span>
                    </Button>
                    <DashboardFreshness
                        generatedAt={stats.generatedAt}
                        label={dashboardLabels.lastUpdated}
                    />
                </div>
            </div>

            {unavailableSections.length > 0 && (
                <DashboardSectionState
                    state="UNAVAILABLE"
                    title="Sebagian data tidak tersedia"
                    description={
                        unavailableSections.join(', ') +
                        ' tidak ditampilkan. Angka kosong tidak dianggap nol.'
                    }
                />
            )}

            {/* Ops portal CTA (Warehouse / Production) */}
            {opsCompact && visiblePortalCta && (
                <Card className="border border-primary/20 bg-primary/5 shadow-sm">
                    <CardContent className="p-4 md:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                                {dashboardLabels.yourWorkspace}
                            </p>
                            <h2 className="text-lg font-semibold text-foreground">
                                {visiblePortalCta.title}
                            </h2>
                            <p className="text-sm text-muted-foreground mt-0.5 max-w-xl">
                                {visiblePortalCta.description}
                            </p>
                        </div>
                        <Button asChild className="shrink-0 gap-2 min-h-11">
                            <Link href={visiblePortalCta.href}>
                                {visiblePortalCta.ctaLabel}
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                        </Button>
                    </CardContent>
                </Card>
            )}

            <section
                className="min-w-0 space-y-3"
                aria-labelledby="health-heading"
            >
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Kondisi
                    </p>
                    <h2 id="health-heading" className="text-lg font-semibold">
                        Kondisi utama
                    </h2>
                </div>
                <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-5 md:gap-4">
                    {kpis.map((kpi) => (
                        <KPICard key={kpi.id} {...kpi} />
                    ))}
                </div>
            </section>

            <section
                className="min-w-0 space-y-3"
                aria-labelledby="attention-heading"
            >
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Perlu perhatian
                    </p>
                    <h2
                        id="attention-heading"
                        className="text-lg font-semibold"
                    >
                        Tindakan berikutnya
                    </h2>
                </div>

                {attention.length > 0 ? (
                    <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2">
                        {attention.map((item) => (
                            <AttentionItem
                                key={item.id}
                                {...item}
                                className={
                                    attention.length % 2 === 1 &&
                                    item.id === attention.at(-1)?.id
                                        ? 'lg:col-span-2'
                                        : undefined
                                }
                            />
                        ))}
                    </div>
                ) : (
                    <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm">
                        <p className="font-medium text-foreground">
                            Tidak ada pengecualian aktif
                        </p>
                        <p className="text-muted-foreground">
                            Tidak ada sinyal lintas divisi yang memerlukan
                            perhatian pada kondisi saat ini.
                        </p>
                    </div>
                )}

                {/* Task-oriented shortcuts; complete module navigation stays in the sidebar. */}
                {!opsCompact && quickActions.length > 0 && (
                    <section
                        className="space-y-3"
                        aria-labelledby="actions-heading"
                    >
                        <h2
                            id="actions-heading"
                            className="text-sm font-semibold text-muted-foreground uppercase tracking-wider"
                        >
                            {dashboardLabels.quickActions}
                        </h2>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {quickActions.map((action) => (
                                <QuickAction
                                    key={action.href + action.label}
                                    {...action}
                                />
                            ))}
                        </div>
                    </section>
                )}

                {/* Compact ops: only quick actions under KPIs */}
                {opsCompact && quickActions.length > 0 && (
                    <section
                        className="space-y-3"
                        aria-labelledby="actions-heading-ops"
                    >
                        <h2
                            id="actions-heading-ops"
                            className="text-sm font-semibold text-muted-foreground uppercase tracking-wider"
                        >
                            {dashboardLabels.quickActions}
                        </h2>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {quickActions.map((action) => (
                                <QuickAction
                                    key={action.href + action.label}
                                    {...action}
                                />
                            ))}
                        </div>
                    </section>
                )}
            </section>

            {/* Canonical P&L trends — Admin / Finance only, minimum four points. */}
            {showDrivers && driverData && (
                <section
                    className="min-w-0 space-y-3"
                    aria-labelledby="drivers-heading"
                >
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Arah utama
                        </p>
                        <h2
                            id="drivers-heading"
                            className="text-lg font-semibold"
                        >
                            Arah pendapatan & laba bersih
                        </h2>
                    </div>
                    <Card className="min-w-0 overflow-hidden shadow-sm border-border/60 bg-card">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                <TrendingUp className="h-4 w-4" />
                                Tren laba rugi bulanan
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="min-w-0 overflow-hidden">
                            <div className="h-[180px] min-w-0 w-full overflow-hidden">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={driverData}>
                                        <defs>
                                            <linearGradient
                                                id="colorRevenueDash"
                                                x1="0"
                                                y1="0"
                                                x2="0"
                                                y2="1"
                                            >
                                                <stop
                                                    offset="5%"
                                                    stopColor="#10b981"
                                                    stopOpacity={0.3}
                                                />
                                                <stop
                                                    offset="95%"
                                                    stopColor="#10b981"
                                                    stopOpacity={0}
                                                />
                                            </linearGradient>
                                        </defs>
                                        <XAxis
                                            dataKey="month"
                                            tickLine={false}
                                            axisLine={false}
                                            tick={{ fontSize: 11 }}
                                            tickFormatter={(val) => {
                                                const parts =
                                                    String(val).split('-');
                                                const months = [
                                                    'Jan',
                                                    'Feb',
                                                    'Mar',
                                                    'Apr',
                                                    'Mei',
                                                    'Jun',
                                                    'Jul',
                                                    'Agu',
                                                    'Sep',
                                                    'Okt',
                                                    'Nov',
                                                    'Des',
                                                ];
                                                return (
                                                    months[
                                                        parseInt(parts[1], 10) -
                                                            1
                                                    ] || val
                                                );
                                            }}
                                        />
                                        <YAxis
                                            tickLine={false}
                                            axisLine={false}
                                            tick={{ fontSize: 11 }}
                                            tickFormatter={(val) =>
                                                `${(Number(val) / 1000000).toFixed(0)}jt`
                                            }
                                            width={50}
                                        />
                                        <Tooltip
                                            contentStyle={{
                                                borderRadius: '8px',
                                                border: 'none',
                                                boxShadow:
                                                    '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                                                fontSize: '12px',
                                            }}
                                            formatter={(value, name) => [
                                                formatRupiah(Number(value)),
                                                String(name),
                                            ]}
                                            labelFormatter={(label) => {
                                                const parts =
                                                    String(label).split('-');
                                                const months = [
                                                    'Januari',
                                                    'Februari',
                                                    'Maret',
                                                    'April',
                                                    'Mei',
                                                    'Juni',
                                                    'Juli',
                                                    'Agustus',
                                                    'September',
                                                    'Oktober',
                                                    'November',
                                                    'Desember',
                                                ];
                                                return `${months[parseInt(parts[1], 10) - 1]} ${parts[0]}`;
                                            }}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="revenue"
                                            name="Pendapatan"
                                            stroke="#10b981"
                                            strokeWidth={2}
                                            fillOpacity={1}
                                            fill="url(#colorRevenueDash)"
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="netIncome"
                                            name="Laba bersih"
                                            stroke="#2563eb"
                                            strokeWidth={2}
                                            strokeDasharray="6 4"
                                            dot={{ r: 2 }}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                        <p className="px-6 pb-5 text-xs text-muted-foreground">
                            Pendapatan ditampilkan sebagai area hijau dengan
                            garis utuh; laba bersih sebagai garis biru
                            putus-putus. Angka detail tersedia pada tooltip dan
                            laporan laba rugi.
                        </p>
                        <ul className="sr-only">
                            {driverData.map((point) => (
                                <li key={point.month}>
                                    {point.month}: pendapatan{' '}
                                    {formatRupiah(point.revenue)}, laba bersih{' '}
                                    {formatRupiah(point.netIncome)}
                                </li>
                            ))}
                        </ul>
                    </Card>
                </section>
            )}
        </div>
    );
}

// --- Subcomponents ---

function AttentionItem({
    module,
    title,
    value,
    detail,
    severity,
    href,
    className,
}: DashboardAttentionItem & { className?: string }) {
    return (
        <Link
            href={href}
            className={cn(
                'flex min-h-11 min-w-0 items-center justify-between gap-4 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-primary/30',
                className,
            )}
        >
            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                    <Badge
                        variant={
                            severity === 'URGENT' ? 'destructive' : 'secondary'
                        }
                    >
                        {severity === 'URGENT' ? 'Mendesak' : 'Tinggi'}
                    </Badge>
                    <span className="text-xs font-medium text-muted-foreground">
                        {module}
                    </span>
                </div>
                <p className="mt-2 font-semibold text-foreground">{title}</p>
                <p className="text-xs text-muted-foreground">{detail}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
                <span className="max-w-40 break-words text-right text-sm font-bold tabular-nums">
                    {value}
                </span>
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </div>
        </Link>
    );
}

function KPICard({
    title,
    value,
    subtitle,
    icon,
    trend,
    trendValue,
    progressValue,
    progressColor,
    unit,
    period,
    definition,
    source,
    state,
    href,
}: DashboardKpi) {
    const tone =
        trend === 'up'
            ? 'text-emerald-600 font-medium'
            : trend === 'down'
              ? 'text-red-600 font-medium'
              : '';

    return (
        <DashboardHealthCard
            title={title}
            value={value}
            icon={icon}
            definition={{ unit, period, description: definition, source }}
            state={state}
            href={href}
            supportingText={
                <span className="flex min-w-0 flex-wrap items-start gap-1.5">
                    <span className={tone}>{trendValue}</span>
                    <span>· {subtitle}</span>
                </span>
            }
            progress={
                progressValue !== undefined
                    ? {
                          value: progressValue,
                          label: 'Pencapaian',
                          indicatorClassName: progressColor,
                      }
                    : undefined
            }
        />
    );
}

function QuickAction({
    href,
    label,
    icon: Icon,
    color,
    bg,
    border,
}: QuickActionItem) {
    return (
        <Link href={href} className="block min-h-[44px]">
            <div
                className={cn(
                    'flex flex-col items-center justify-center gap-2.5 p-4 rounded-xl',
                    'border border-transparent bg-card shadow-sm',
                    'cursor-pointer transition-all duration-200',
                    'hover:shadow-md hover:scale-[1.01] active:scale-[0.99]',
                    border,
                )}
            >
                <div
                    className={cn(
                        'h-10 w-10 rounded-full flex items-center justify-center transition-colors',
                        bg,
                    )}
                >
                    <Icon className={cn('h-5 w-5', color)} />
                </div>
                <span className="font-semibold text-sm text-center text-foreground leading-tight">
                    {label}
                </span>
            </div>
        </Link>
    );
}
