'use client';

// import { useEffect, useState } from 'react'; // Removed unused hooks
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
    LucideIcon
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
        <div className="p-4 md:p-6 lg:p-8 space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">{t('title')}</h1>
                    <p className="text-sm md:base text-muted-foreground mt-1">{t('subtitle')}</p>
                </div>
                <div className="flex gap-2">
                    <Badge variant="outline" className="px-3 py-1 text-sm bg-background" suppressHydrationWarning>
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
                    variant="neutral"
                />
                <KPICard
                    title={t('machineUtil')}
                    value={`${stats.production.runningMachines} / ${stats.production.totalMachines} ${t('runningMachines')}`}
                    subtitle={`${t('yieldRate')}: ${stats.production.yieldRate.toFixed(1)}%`}
                    icon={Factory}
                    trend="neutral"
                    trendValue="Stable capacity"
                />
                <KPICard
                    title={t('inventoryValue')}
                    value={formatRupiah(stats.inventory.totalValue)}
                    subtitle={`${stats.inventory.lowStockCount} ${t('lowStock')}`}
                    icon={Package}
                    trend="neutral"
                    trendValue="Healthy levels"
                />
            </div>

            {/* Section Summaries Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6">

                {/* Sales Summary */}
                <SummaryCard
                    title={t('salesPerf')}
                    icon={TrendingUp}
                    href="/sales"
                    accentColor="text-emerald-600"
                    bgColor="bg-emerald-50"
                >
                    <div className="space-y-4">
                        <MetricRow label={t('activeQuotes')} value={stats.sales.activeOrders.toString()} />
                        <MetricRow label={t('pendingInv')} value={stats.sales.pendingInvoices.toString()} />
                        <div className="pt-2">
                            <Link href="/sales/analytics" className="text-xs font-medium text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
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
                    accentColor="text-blue-600"
                    bgColor="bg-blue-50"
                >
                    <div className="space-y-4">
                        <MetricRow label={t('pendingPOs')} value={stats.purchasing.pendingPOs.toString()} />
                        <MetricRow label={t('spending')} value={formatRupiah(stats.purchasing.mtdSpending)} />
                        <div className="pt-2">
                            <Link href="/planning/procurement-analytics" className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1">
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
                    accentColor="text-amber-600"
                    bgColor="bg-amber-50"
                >
                    <div className="space-y-4">
                        <MetricRow label={t('yieldRate')} value={`${stats.production.yieldRate.toFixed(1)}%`} />
                        <MetricRow
                            label={t('totalScrap')}
                            value={`${stats.production.totalScrapKg.toFixed(1)} kg`}
                            valueClass={stats.production.totalScrapKg > 0 ? "text-red-500 font-bold" : ""}
                        />
                        <MetricRow label={t('downtime')} value={`${stats.production.downtimeHours.toFixed(1)} hrs`} />
                        <div className="pt-2">
                            <Link href="/planning/production-analytics" className="text-xs font-medium text-amber-600 hover:text-amber-700 flex items-center gap-1">
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
                    accentColor="text-purple-600"
                    bgColor="bg-purple-50"
                >
                    <div className="space-y-4">
                        <MetricRow label={t('totalItems')} value={stats.inventory.totalItems.toLocaleString()} />
                        <MetricRow
                            label={t('lowStockAlerts')}
                            value={stats.inventory.lowStockCount.toString()}
                            valueClass={stats.inventory.lowStockCount > 0 ? "text-red-500 font-bold" : "text-zinc-700"}
                        />
                        <div className="pt-2">
                            <Link href="/warehouse/analytics" className="text-xs font-medium text-purple-600 hover:text-purple-700 flex items-center gap-1">
                                {t('viewAnalytics')} <ArrowRight className="h-3 w-3" />
                            </Link>
                        </div>
                    </div>
                </SummaryCard>

            </div>

            {/* Quick Actions Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
                {/* Downtime log is likely in production module, possibly needing a new route if not exists, but mapping to close equivalent or generic prod  */}
                {/* Adjusting to /production/machines for now as downtime is machine related */}
                <QuickAction href="/production/machines" label={t('logDowntime')} icon={TrendingDown} />
                <QuickAction href="/kiosk" label={t('recordScrap')} icon={Factory} />
                <QuickAction href="/planning/orders/create" label={t('newOrder')} icon={Factory} />
                <QuickAction href="/dashboard/products/create" label={t('addProduct')} icon={Package} />
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
    variant?: 'default' | 'neutral';
}

function KPICard({ title, value, subtitle, icon: Icon, trend, trendValue, variant = 'default' }: KPICardProps) {
    // variant is currently unused but kept for interface consistency or future styling
    // to suppress lint unused var error for now without removing prop:
    void variant;

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                    {title}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{value}</div>
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    {trend === 'up' && <TrendingUp className="h-3 w-3 text-emerald-500" />}
                    {trend === 'down' && <TrendingDown className="h-3 w-3 text-red-500" />}
                    <span className={trend === 'up' ? 'text-emerald-500' : trend === 'down' ? 'text-red-500' : ''}>
                        {trendValue}
                    </span>
                    <span className="text-muted-foreground ml-1">in {subtitle}</span>
                </p>
            </CardContent>
        </Card>
    );
}

interface SummaryCardProps {
    title: string;
    icon: LucideIcon;
    children: React.ReactNode;
    href: string;
    accentColor: string;
    bgColor: string;
}

function SummaryCard({ title, icon: Icon, children, href, accentColor, bgColor }: SummaryCardProps) {
    return (
        <Card className="flex flex-col h-full border-t-4" style={{ borderColor: 'currentColor' }}>
            <div className={`${accentColor} border-t-4 rounded-t-xl`} style={{ marginTop: -4 }}></div>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <div className={`p-2 rounded-lg ${bgColor} ${accentColor}`}>
                            <Icon className="h-4 w-4" />
                        </div>
                        {title}
                    </CardTitle>
                    <Link href={href}>
                        <Button variant="ghost" size="icon-sm" className="h-8 w-8">
                            <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                        </Button>
                    </Link>
                </div>
            </CardHeader>
            <CardContent className="flex-1">
                {children}
            </CardContent>
        </Card>
    );
}

interface MetricRowProps {
    label: string;
    value: string;
    valueClass?: string;
}

function MetricRow({ label, value, valueClass }: MetricRowProps) {
    return (
        <div className="flex items-center justify-between py-1 border-b border-dashed border-zinc-100 last:border-0">
            <span className="text-sm text-muted-foreground">{label}</span>
            <span className={`text-sm font-semibold text-zinc-900 ${valueClass || ''}`}>{value}</span>
        </div>
    );
}

interface QuickActionProps {
    href: string;
    label: string;
    icon: LucideIcon;
}

function QuickAction({ href, label, icon: Icon }: QuickActionProps) {
    return (
        <Link href={href} className="flex items-center gap-3 p-4 rounded-xl border bg-card hover:bg-muted/50 hover:border-zinc-300 transition-all group">
            <div className="h-10 w-10 rounded-full bg-zinc-100 flex items-center justify-center group-hover:bg-zinc-200 transition-colors">
                <Icon className="h-5 w-5 text-zinc-600" />
            </div>
            <span className="font-medium text-sm text-foreground">{label}</span>
        </Link>
    )
}

