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
    buildModuleShortcuts,
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
    ArrowUpRight,
    AlertCircle,
    AlertTriangle,
    RefreshCw,
    CheckCircle2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils/utils';

interface DashboardCeoNote {
    id: string;
    priority: 'CRITICAL' | 'NORMAL';
    status: string;
    title: string;
    occurrences: number;
}

interface DashboardClientProps {
    stats: ExecutiveStats | null;
    ceoNotes: DashboardCeoNote[];
    userName: string;
    userRole: string;
    permissions: string[] | 'ALL';
    activeModules?: string[];
    presentation: DashboardPresentation;
}

export default function DashboardClient({
    stats,
    ceoNotes,
    userName,
    userRole,
    permissions,
    activeModules,
    presentation,
}: DashboardClientProps) {
    const router = useRouter();
    const [isRefreshing, setIsRefreshing] = useState(false);

    const role = (userRole || 'ADMIN') as DashboardRole;
    const opsCompact = isOpsPortalRole(role);
    const portalCta = getPortalCta(role);
    const showChart = canSeeExecutiveChart(role) && !opsCompact;

    const handleRefresh = () => {
        setIsRefreshing(true);
        router.refresh();
        setTimeout(() => setIsRefreshing(false), 1000);
    };

    const { currentDate, greeting, encouragement } = presentation;
    const firstName = userName.split(' ')[0] || userName;

    if (!stats) {
        return (
            <div className="p-4 md:p-6 lg:p-8 flex flex-col items-center justify-center min-h-[50vh] space-y-4">
                <AlertCircle className="w-12 h-12 text-muted-foreground/50" />
                <h2 className="text-xl font-semibold">
                    {dashboardLabels.loadFailed}
                </h2>
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

    const kpis = buildKpis(role, stats);
    const quickActions = buildQuickActions(role).filter((a) =>
        canAccessResource(permissions, a.resourceHint),
    );
    const modules = buildModuleShortcuts(activeModules).filter((m) =>
        canAccessResource(permissions, m.resourceHint),
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

                <div className="flex gap-2 items-center shrink-0">
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
                </div>
            </div>

            {/* Ops portal CTA (Warehouse / Production) */}
            {opsCompact && portalCta && (
                <Card className="border border-primary/20 bg-primary/5 shadow-sm">
                    <CardContent className="p-4 md:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                                {dashboardLabels.yourWorkspace}
                            </p>
                            <h2 className="text-lg font-semibold text-foreground">
                                {portalCta.title}
                            </h2>
                            <p className="text-sm text-muted-foreground mt-0.5 max-w-xl">
                                {portalCta.description}
                            </p>
                        </div>
                        <Button asChild className="shrink-0 gap-2 min-h-11">
                            <Link href={portalCta.href}>
                                {portalCta.ctaLabel}
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* CEO Notes queue */}
            <section aria-labelledby="ceonotes-heading" className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                    <h2
                        id="ceonotes-heading"
                        className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2"
                    >
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                        {dashboardLabels.ceoNotesTitle}
                    </h2>
                    {ceoNotes.length > 0 && (
                        <Badge variant="outline" className="tabular-nums">
                            {ceoNotes.length}
                        </Badge>
                    )}
                </div>

                {ceoNotes.length === 0 ? (
                    <Card className="shadow-sm border-dashed bg-card">
                        <CardContent className="py-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            {dashboardLabels.ceoNotesEmpty}
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        {ceoNotes.map((note) => (
                            <CeoNoteCard key={note.id} note={note} />
                        ))}
                    </div>
                )}
            </section>

            {/* KPI strip */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                {kpis.map((kpi) => (
                    <KPICard key={kpi.id} {...kpi} />
                ))}
            </div>

            {/* Module shortcuts + Quick actions */}
            {!opsCompact && (
                <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
                    <section
                        className="xl:col-span-3 space-y-3"
                        aria-labelledby="modules-heading"
                    >
                        <h2
                            id="modules-heading"
                            className="text-sm font-semibold text-muted-foreground uppercase tracking-wider"
                        >
                            {dashboardLabels.moduleShortcuts}
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {modules.map((mod) => {
                                const Icon = mod.icon;
                                return (
                                    <Link
                                        key={mod.href}
                                        href={mod.href}
                                        className="group"
                                    >
                                        <Card className="h-full shadow-sm border-border/60 bg-card hover:shadow-md hover:border-primary/30 transition-all cursor-pointer">
                                            <CardContent className="p-4 flex items-start gap-3 min-h-[72px]">
                                                <div
                                                    className={cn(
                                                        'p-2.5 rounded-lg shrink-0',
                                                        mod.iconBg,
                                                        mod.iconColor,
                                                    )}
                                                >
                                                    <Icon className="h-4 w-4" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center justify-between gap-1">
                                                        <p className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
                                                            {mod.label}
                                                        </p>
                                                        <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                                    </div>
                                                    <p className="text-xs text-muted-foreground mt-0.5">
                                                        {mod.description}
                                                    </p>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </Link>
                                );
                            })}
                        </div>
                    </section>

                    <section
                        className="xl:col-span-2 space-y-3"
                        aria-labelledby="actions-heading"
                    >
                        <h2
                            id="actions-heading"
                            className="text-sm font-semibold text-muted-foreground uppercase tracking-wider"
                        >
                            {dashboardLabels.quickActions}
                        </h2>
                        <div className="grid grid-cols-2 gap-3">
                            {quickActions.map((action) => (
                                <QuickAction
                                    key={action.href + action.label}
                                    {...action}
                                />
                            ))}
                        </div>
                    </section>
                </div>
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

function CeoNoteCard({ note }: { note: DashboardCeoNote }) {
    const critical = note.priority === 'CRITICAL';
    return (
        <Link href="/ceo-notes" className="group block min-h-[44px]">
            <Card
                className={cn(
                    'h-full shadow-sm transition-all hover:shadow-md cursor-pointer',
                    critical
                        ? 'border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20'
                        : 'border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/15',
                )}
            >
                <CardContent className="p-3.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground leading-snug line-clamp-2">
                            {note.title}
                        </p>
                        <p className="text-xs text-primary font-semibold flex items-center gap-1 mt-1.5 group-hover:underline">
                            {dashboardLabels.openItem}{' '}
                            <ArrowRight className="h-3 w-3" />
                        </p>
                    </div>
                    {note.occurrences > 1 && (
                        <span className="text-2xl font-bold tabular-nums shrink-0 text-amber-600 dark:text-amber-400">
                            {note.occurrences}x
                        </span>
                    )}
                </CardContent>
            </Card>
        </Link>
    );
}

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
