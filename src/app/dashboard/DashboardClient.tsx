'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { type ExecutiveStats } from '@/services/dashboard/executive-stats-service';
import { formatRupiah } from '@/lib/utils/utils';
import { dashboardLabels } from '@/lib/labels';
import {
    buildKpis,
    buildQuickActions,
    canAccessResource,
    canSeeExecutiveChart,
    getPortalCta,
    isOpsPortalRole,
    roleDisplayName,
    type DashboardKpi,
    type DashboardPresentation,
    type DashboardRole,
    type QuickActionItem,
} from '@/lib/dashboard/role-dashboard-config';
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    Tooltip,
} from 'recharts';
import {
    TrendingUp,
    TrendingDown,
    ArrowRight,
    AlertCircle,
    RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { cn } from '@/lib/utils/utils';

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

    const kpis = buildKpis(role, stats).filter((kpi) =>
        canAccessResource(permissions, kpi.resourceHint),
    );
    const quickActions = buildQuickActions(role).filter((a) =>
        canAccessResource(permissions, a.resourceHint),
    );
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
                    <p
                        className="text-xs text-muted-foreground tabular-nums"
                        aria-live="polite"
                    >
                        {dashboardLabels.lastUpdated} {presentation.lastUpdated}
                    </p>
                </div>
            </div>

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

            {/* KPI strip */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                {kpis.map((kpi) => (
                    <KPICard key={kpi.id} {...kpi} />
                ))}
            </div>

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

            {/* Revenue trend — Admin / Finance only */}
            {showChart &&
                stats.revenueTrendChart &&
                stats.revenueTrendChart.length > 1 && (
                    <Card className="shadow-sm border-border/60 bg-card">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                <TrendingUp className="h-4 w-4" />
                                {dashboardLabels.revenueTrend}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[180px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={stats.revenueTrendChart}>
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
                                            formatter={(value) => [
                                                formatRupiah(Number(value)),
                                                'Pendapatan',
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
                                            stroke="#10b981"
                                            strokeWidth={2}
                                            fillOpacity={1}
                                            fill="url(#colorRevenueDash)"
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>
                )}
        </div>
    );
}

// --- Subcomponents ---

function KPICard({
    title,
    value,
    subtitle,
    icon: Icon,
    trend,
    trendValue,
    progressValue,
    progressColor,
    href,
}: DashboardKpi) {
    const body = (
        <Card
            className={cn(
                'shadow-sm border-border/60 bg-card h-full transition-shadow',
                href &&
                    'hover:shadow-md cursor-pointer hover:border-primary/25',
            )}
        >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                    {title}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-xl md:text-2xl font-bold tracking-tight text-foreground tabular-nums break-words">
                    {value}
                </div>
                <p className="text-xs text-muted-foreground mt-2 flex items-start gap-1.5 flex-wrap">
                    {trend === 'up' && (
                        <TrendingUp className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    )}
                    {trend === 'down' && (
                        <TrendingDown className="h-3.5 w-3.5 text-red-600 shrink-0 mt-0.5" />
                    )}
                    {trend === 'neutral' && (
                        <span className="w-1 h-1 rounded-full bg-zinc-400 mx-1 mt-1.5 shrink-0" />
                    )}
                    <span
                        className={
                            trend === 'up'
                                ? 'text-emerald-600 font-medium'
                                : trend === 'down'
                                  ? 'text-red-600 font-medium'
                                  : ''
                        }
                    >
                        {trendValue}
                    </span>
                    <span className="text-muted-foreground/80">
                        · {subtitle}
                    </span>
                </p>
                {progressValue !== undefined && (
                    <div className="mt-3">
                        <Progress
                            value={progressValue}
                            className="h-1.5"
                            indicatorClassName={progressColor}
                        />
                    </div>
                )}
            </CardContent>
        </Card>
    );

    if (href) {
        return (
            <Link href={href} className="block h-full">
                {body}
            </Link>
        );
    }
    return body;
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
