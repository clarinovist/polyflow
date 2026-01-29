'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ExecutiveStats } from '@/actions/dashboard';
import { formatRupiah } from '@/lib/utils';
import {
    TrendingUp,
    TrendingDown,
    ShoppingCart,
    Factory,
    Package,
    ArrowUpRight,
    ArrowRight,
    Wallet,
    LucideIcon,
    AlertCircle
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';

interface DashboardClientProps {
    stats: ExecutiveStats;
}

export default function DashboardClient({ stats }: DashboardClientProps) {
    const t = useTranslations('dashboard.overview');
    const currentDate = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    return (
        <div className="p-4 md:p-6 lg:p-8 space-y-8 animate-in fade-in duration-500 max-w-[1600px] mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">{t('title')}</h1>
                    <p className="text-sm md:base text-muted-foreground mt-1">{t('subtitle')}</p>
                </div>
                <div className="flex gap-2">
                    <Badge variant="outline" className="px-3 py-1 text-sm bg-background shadow-sm" suppressHydrationWarning>
                        {currentDate}
                    </Badge>
                </div>
            </div>

            {/* KPI Cards Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                    title={t('revenue')}
                    value={formatRupiah(stats.sales.mtdRevenue)}
                    subtitle={`${stats.sales.activeOrders} ${t('activeOrders')}`}
                    icon={Wallet}
                    trend="up"
                    trendValue="+12% vs last month"
                />
                <KPICard
                    title={t('spending')}
                    value={formatRupiah(stats.purchasing.mtdSpending)}
                    subtitle={`${stats.purchasing.pendingPOs} ${t('pendingPOs')}`}
                    icon={ShoppingCart}
                    trend="down"
                    trendValue="-5% vs last month"
                />
                <KPICard
                    title={t('machineUtil')}
                    value={`${stats.production.runningMachines} / ${stats.production.totalMachines} ${t('runningMachines')}`}
                    subtitle={`${t('yieldRate')}: ${stats.production.yieldRate.toFixed(1)}%`}
                    icon={Factory}
                    trend="neutral"
                    trendValue="Stable capacity"
                    progressValue={stats.production.yieldRate}
                    progressColor="bg-blue-600"
                />
                <KPICard
                    title={t('inventoryValue')}
                    value={formatRupiah(stats.inventory.totalValue)}
                    subtitle={`${stats.inventory.lowStockCount} ${t('lowStock')}`}
                    icon={Package}
                    trend={stats.inventory.lowStockCount > 0 ? 'down' : 'neutral'}
                    trendValue={stats.inventory.lowStockCount > 0 ? "Needs Attention" : "Healthy levels"}
                />
            </div>

            {/* Section Summaries Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6">

                {/* Sales Summary */}
                <SummaryCard
                    title={t('salesPerf')}
                    icon={TrendingUp}
                    href="/sales"
                    iconBg="bg-emerald-100 dark:bg-emerald-900/30"
                    iconColor="text-emerald-600 dark:text-emerald-400"
                >
                    <div className="space-y-4">
                        <MetricRow label={t('activeQuotes')} value={stats.sales.activeOrders.toString()} />
                        <MetricRow label={t('pendingInv')} value={stats.sales.pendingInvoices.toString()} />
                        <div className="pt-2">
                            <Link href="/sales/analytics" className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 flex items-center gap-1 transition-colors">
                                {t('viewAnalytics')} <ArrowRight className="h-3 w-3" />
                            </Link>
                        </div>
                    </div>
                </SummaryCard>

                {/* Procurement Summary */}
                <SummaryCard
                    title={t('procurement')}
                    icon={ShoppingCart}
                    href="/planning/purchase-orders"
                    iconBg="bg-blue-100 dark:bg-blue-900/30"
                    iconColor="text-blue-600 dark:text-blue-400"
                >
                    <div className="space-y-4">
                        <MetricRow label={t('pendingPOs')} value={stats.purchasing.pendingPOs.toString()} />
                        <MetricRow label={t('spending')} value={formatRupiah(stats.purchasing.mtdSpending)} />
                        <div className="pt-2">
                            <Link href="/planning/procurement-analytics" className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1 transition-colors">
                                {t('viewAnalytics')} <ArrowRight className="h-3 w-3" />
                            </Link>
                        </div>
                    </div>
                </SummaryCard>

                {/* Production Summary */}
                <SummaryCard
                    title={t('manufacturing')}
                    icon={Factory}
                    href="/planning/orders"
                    iconBg="bg-amber-100 dark:bg-amber-900/30"
                    iconColor="text-amber-600 dark:text-amber-400"
                >
                    <div className="space-y-4">
                        <MetricRow label={t('yieldRate')} value={`${stats.production.yieldRate.toFixed(1)}%`} />
                        <MetricRow
                            label={t('totalScrap')}
                            value={`${stats.production.totalScrapKg.toFixed(1)} kg`}
                            valueClass={stats.production.totalScrapKg > 0 ? "text-red-600 font-bold" : ""}
                        />
                        <MetricRow label={t('downtime')} value={`${stats.production.downtimeHours.toFixed(1)} hrs`} />
                        <div className="pt-2">
                            <Link href="/planning/production-analytics" className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 flex items-center gap-1 transition-colors">
                                {t('viewAnalytics')} <ArrowRight className="h-3 w-3" />
                            </Link>
                        </div>
                    </div>
                </SummaryCard>

                {/* Inventory Summary */}
                <SummaryCard
                    title={t('invHealth')}
                    icon={Package}
                    href="/warehouse/inventory"
                    iconBg="bg-purple-100 dark:bg-purple-900/30"
                    iconColor="text-purple-600 dark:text-purple-400"
                >
                    <div className="space-y-4">
                        <MetricRow label={t('totalItems')} value={stats.inventory.totalItems.toLocaleString()} />
                        <MetricRow
                            label={t('lowStockAlerts')}
                            value={stats.inventory.lowStockCount.toString()}
                            valueClass={stats.inventory.lowStockCount > 0 ? "text-red-600 font-bold" : "text-zinc-700"}
                            icon={stats.inventory.lowStockCount > 0 ? <AlertCircle className="w-4 h-4 text-red-500" /> : undefined}
                        />
                        <div className="pt-2">
                            <Link href="/warehouse/analytics" className="text-xs font-semibold text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 flex items-center gap-1 transition-colors">
                                {t('viewAnalytics')} <ArrowRight className="h-3 w-3" />
                            </Link>
                        </div>
                    </div>
                </SummaryCard>

            </div>

            {/* Quick Actions Row */}
            <div className="pt-6 border-t">
                <h3 className="text-sm font-semibold text-muted-foreground mb-4 uppercase tracking-wider">Quick Actions</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <QuickAction href="/production/machines" label={t('logDowntime')} icon={TrendingDown} color="text-red-600" bg="bg-red-50 dark:bg-red-900/10" border="hover:border-red-200 dark:hover:border-red-800" />
                    <QuickAction href="/kiosk" label={t('recordScrap')} icon={Factory} color="text-amber-600" bg="bg-amber-50 dark:bg-amber-900/10" border="hover:border-amber-200 dark:hover:border-amber-800" />
                    <QuickAction href="/planning/orders/create" label={t('newOrder')} icon={Factory} color="text-blue-600" bg="bg-blue-50 dark:bg-blue-900/10" border="hover:border-blue-200 dark:hover:border-blue-800" />
                    <QuickAction href="/dashboard/products/create" label={t('addProduct')} icon={Package} color="text-emerald-600" bg="bg-emerald-50 dark:bg-emerald-900/10" border="hover:border-emerald-200 dark:hover:border-emerald-800" />
                </div>
            </div>
        </div>
    );
}

// --- Components ---

interface KPICardProps {
    title: string;
    value: string;
    subtitle: string;
    icon: LucideIcon;
    trend: 'up' | 'down' | 'neutral';
    trendValue: string;
    progressValue?: number;
    progressColor?: string;
}

function KPICard({ title, value, subtitle, icon: Icon, trend, trendValue, progressValue, progressColor }: KPICardProps) {
    return (
        <Card className="shadow-sm border-none bg-card hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                    {title}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold tracking-tight text-foreground">{value}</div>
                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
                    {trend === 'up' && <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />}
                    {trend === 'down' && <TrendingDown className="h-3.5 w-3.5 text-red-600" />}
                    {trend === 'neutral' && <span className="w-1 h-1 rounded-full bg-zinc-400 mx-1"></span>}

                    <span className={trend === 'up' ? 'text-emerald-600 font-medium' : trend === 'down' ? 'text-red-600 font-medium' : ''}>
                        {trendValue}
                    </span>
                    <span className="text-muted-foreground/80">in {subtitle}</span>
                </p>
                {progressValue !== undefined && (
                    <div className="mt-3">
                        <Progress value={progressValue} className="h-1.5" indicatorClassName={progressColor} />
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

interface SummaryCardProps {
    title: string;
    icon: LucideIcon;
    children: React.ReactNode;
    href: string;
    iconBg: string;
    iconColor: string;
}

function SummaryCard({ title, icon: Icon, children, href, iconBg, iconColor }: SummaryCardProps) {
    return (
        <Card className="flex flex-col h-full shadow-sm border-none bg-card hover:shadow-md transition-all">
            <CardHeader className="pb-3 border-b border-zinc-100 dark:border-zinc-800/50">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold flex items-center gap-3">
                        <div className={`p-2.5 rounded-lg ${iconBg} ${iconColor}`}>
                            <Icon className="h-4.5 w-4.5" />
                        </div>
                        {title}
                    </CardTitle>
                    <Link href={href}>
                        <Button variant="ghost" size="icon-sm" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                            <ArrowUpRight className="h-4 w-4" />
                        </Button>
                    </Link>
                </div>
            </CardHeader>
            <CardContent className="flex-1 pt-4 px-6 pb-6">
                {children}
            </CardContent>
        </Card>
    );
}

interface MetricRowProps {
    label: string;
    value: string;
    valueClass?: string;
    icon?: React.ReactNode;
}

function MetricRow({ label, value, valueClass, icon }: MetricRowProps) {
    return (
        <div className="flex items-center justify-between py-2 border-b border-dashed border-zinc-100 dark:border-zinc-800 last:border-0 last:pb-0">
            <span className="text-sm text-muted-foreground font-medium">{label}</span>
            <div className="flex items-center gap-2">
                {icon}
                <span className={`text-sm font-bold text-foreground ${valueClass || ''}`}>{value}</span>
            </div>
        </div>
    );
}

interface QuickActionProps {
    href: string;
    label: string;
    icon: LucideIcon;
    color: string;
    bg: string;
    border: string;
}

function QuickAction({ href, label, icon: Icon, color, bg, border }: QuickActionProps) {
    return (
        <Link href={href}>
            <div className={`
                flex flex-col items-center justify-center gap-3 p-4 rounded-xl 
                border border-transparent bg-white dark:bg-card shadow-sm 
                cursor-pointer transition-all duration-200 
                hover:shadow-md hover:scale-[1.02] ${border}
            `}>
                <div className={`h-10 w-10 rounded-full ${bg} flex items-center justify-center transition-colors`}>
                    <Icon className={`h-5 w-5 ${color}`} />
                </div>
                <span className="font-semibold text-sm text-center text-foreground">{label}</span>
            </div>
        </Link>
    )
}

