'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardAction } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import {
    Package,
    TrendingUp,
    AlertTriangle,
    ArrowUpRight,
    Plus,
    Factory,
    Boxes,
    PackageCheck,
    ShoppingCart
} from 'lucide-react';
import Link from 'next/link';
import {
    PieChart,
    Pie,
    Cell,
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip
} from 'recharts';

// Types
export interface DashboardStats {
    productCount: number;
    totalStock: number;
    lowStockCount: number;
    recentMovements: number;
}

export interface ProductionOrder {
    id: string;
    orderNumber: string;
    status: 'DRAFT' | 'RELEASED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
    plannedQuantity: number;
    actualQuantity: number | null;
    bom: {
        productVariant: {
            name: string;
        };
    };
    createdAt: Date;
}

export interface StockMovement {
    id: string;
    type: string;
    quantity: { toNumber: () => number } | number;
    createdAt: Date;
    productVariant: {
        name: string;
        product: {
            name: string;
        };
    };
}

interface DashboardClientProps {
    stats: DashboardStats;
    productionOrders: ProductionOrder[];
    recentMovements: StockMovement[];
}

// Chart colors from PolyFlow design system
const CHART_COLORS = [
    'hsl(var(--chart-1))',
    'hsl(var(--chart-2))',
    'hsl(var(--chart-3))',
    'hsl(var(--chart-4))',
    'hsl(var(--chart-5))',
];

const STATUS_COLORS: Record<string, string> = {
    DRAFT: 'secondary',
    RELEASED: 'outline',
    IN_PROGRESS: 'default',
    COMPLETED: 'default',
    CANCELLED: 'destructive',
};

export default function DashboardClient({ stats, productionOrders, recentMovements }: DashboardClientProps) {
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsMounted(true);
    }, []);

    return (
        <div className="p-8 space-y-8">
            {/* Header */}
            <div>
                <p className="text-sm text-muted-foreground">Manage and track your operations</p>
                <h1 className="text-3xl font-bold text-foreground tracking-tight">Dashboard</h1>
            </div>

            {/* Main Grid Layout */}
            <div className="grid grid-cols-12 gap-6">
                {/* Column 1: Production Orders (Span 3) */}
                <div className="col-span-12 lg:col-span-3">
                    <ProductionOrdersWidget orders={productionOrders} />
                </div>

                {/* Column 2: Analytics & Inventory (Span 6) */}
                <div className="col-span-12 lg:col-span-6 space-y-6">
                    {/* Charts Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <InventoryOverviewChart stats={stats} isMounted={isMounted} />
                        <StockMovementChart movements={recentMovements} isMounted={isMounted} />
                    </div>

                    {/* Inventory Status */}
                    <InventoryStatusWidget stats={stats} />
                </div>

                {/* Column 3: Alerts & Quick Actions (Span 3) */}
                <div className="col-span-12 lg:col-span-3 space-y-6">
                    <LowStockAlertsWidget lowStockCount={stats.lowStockCount} />
                    <QuickActionsWidget />
                </div>
            </div>
        </div>
    );
}

// ============================================
// Production Orders Widget (Column 1)
// ============================================
function ProductionOrdersWidget({ orders }: { orders: ProductionOrder[] }) {
    const activeOrders = orders.filter(o => o.status !== 'COMPLETED' && o.status !== 'CANCELLED').slice(0, 5);

    return (
        <Card className="h-full">
            <CardHeader className="pb-4">
                <CardTitle className="text-lg font-medium flex items-center gap-2">
                    <Factory className="h-5 w-5 text-muted-foreground" />
                    Production Orders
                </CardTitle>
                <CardAction>
                    <Link href="/dashboard/production/orders/create">
                        <Button variant="ghost" size="icon-sm">
                            <Plus className="h-4 w-4" />
                        </Button>
                    </Link>
                </CardAction>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Filter Tabs */}
                <div className="flex gap-2">
                    <Badge variant="default" className="cursor-pointer">Active</Badge>
                    <Badge variant="secondary" className="cursor-pointer">All</Badge>
                </div>

                {/* Orders List */}
                <div className="space-y-3">
                    {activeOrders.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4 text-center">
                            No active production orders
                        </p>
                    ) : (
                        activeOrders.map((order) => (
                            <div
                                key={order.id}
                                className="p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors"
                            >
                                <div className="flex items-start justify-between gap-2 mb-2">
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-sm truncate">
                                            {order.bom.productVariant.name}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {order.orderNumber}
                                        </p>
                                    </div>
                                    <Badge
                                        variant={STATUS_COLORS[order.status] as 'default' | 'secondary' | 'outline' | 'destructive'}
                                        className="text-xs shrink-0"
                                    >
                                        {order.status.replace('_', ' ')}
                                    </Badge>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-muted-foreground">
                                        {order.actualQuantity ?? 0} / {order.plannedQuantity} units
                                    </span>
                                    <Link href={`/dashboard/production/orders/${order.id}`}>
                                        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
                                            View
                                        </Button>
                                    </Link>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* View All Link */}
                {orders.length > 5 && (
                    <Link
                        href="/dashboard/production/orders"
                        className="flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors pt-2"
                    >
                        See All Orders <ArrowUpRight className="h-3 w-3" />
                    </Link>
                )}
            </CardContent>
        </Card>
    );
}

// ============================================
// Inventory Overview Chart (Donut)
// ============================================
function InventoryOverviewChart({ stats: _stats, isMounted }: { stats: DashboardStats, isMounted: boolean }) {
    // Mock data for product type distribution
    const data = [
        { name: 'Raw Materials', value: 45, color: CHART_COLORS[0] },
        { name: 'Finished Goods', value: 35, color: CHART_COLORS[1] },
        { name: 'Packaging', value: 20, color: CHART_COLORS[2] },
    ];

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-lg font-medium flex items-center gap-2">
                    <Boxes className="h-5 w-5 text-muted-foreground" />
                    Inventory Overview
                </CardTitle>
                <CardAction>
                    <Link href="/dashboard/inventory">
                        <Button variant="ghost" size="icon-sm">
                            <ArrowUpRight className="h-4 w-4" />
                        </Button>
                    </Link>
                </CardAction>
            </CardHeader>
            <CardContent>
                <div className="h-[180px] w-full" style={{ height: 180, minHeight: 180 }}>
                    {isMounted ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={data}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={50}
                                    outerRadius={70}
                                    paddingAngle={2}
                                    dataKey="value"
                                >
                                    {data.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                            return (
                                                <div className="bg-popover border rounded-lg p-2 shadow-md">
                                                    <p className="text-sm font-medium">{payload[0].name}</p>
                                                    <p className="text-xs text-muted-foreground">{payload[0].value}%</p>
                                                </div>
                                            );
                                        }
                                        return null;
                                    }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-full w-full flex items-center justify-center bg-muted/5 animate-pulse rounded" />
                    )}
                </div>
                {/* Legend */}
                <div className="flex flex-wrap justify-center gap-4 mt-2">
                    {data.map((item, index) => (
                        <div key={index} className="flex items-center gap-1.5">
                            <div
                                className="w-2.5 h-2.5 rounded-full"
                                style={{ backgroundColor: item.color }}
                            />
                            <span className="text-xs text-muted-foreground">{item.name}</span>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

// ============================================
// Stock Movement Chart (Area)
// ============================================
function StockMovementChart({ movements, isMounted }: { movements: StockMovement[], isMounted: boolean }) {
    // Process movements into daily aggregates for the chart
    const chartData = processMovementsForChart(movements);

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-lg font-medium flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-muted-foreground" />
                    Stock Movement
                </CardTitle>
                <CardAction>
                    <Link href="/dashboard/inventory/history">
                        <Button variant="ghost" size="icon-sm">
                            <ArrowUpRight className="h-4 w-4" />
                        </Button>
                    </Link>
                </CardAction>
            </CardHeader>
            <CardContent>
                <div className="h-[180px] w-full" style={{ height: 180, minHeight: 180 }}>
                    {isMounted ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorIn" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                                <XAxis
                                    dataKey="date"
                                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <YAxis
                                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <Tooltip
                                    content={({ active, payload, label }) => {
                                        if (active && payload && payload.length) {
                                            return (
                                                <div className="bg-popover border rounded-lg p-2 shadow-md">
                                                    <p className="text-sm font-medium mb-1">{label}</p>
                                                    {payload.map((item, i) => (
                                                        <p key={i} className="text-xs text-muted-foreground">
                                                            {item.name}: {item.value}
                                                        </p>
                                                    ))}
                                                </div>
                                            );
                                        }
                                        return null;
                                    }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="in"
                                    name="Stock In"
                                    stroke="var(--chart-2)"
                                    fill="url(#colorIn)"
                                    strokeWidth={2}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="out"
                                    name="Stock Out"
                                    stroke="var(--chart-1)"
                                    fill="url(#colorOut)"
                                    strokeWidth={2}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-full w-full flex items-center justify-center bg-muted/5 animate-pulse rounded" />
                    )}
                </div>
                {/* Legend */}
                <div className="flex justify-center gap-6 mt-2">
                    <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'var(--chart-2)' }} />
                        <span className="text-xs text-muted-foreground">Stock In</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'var(--chart-1)' }} />
                        <span className="text-xs text-muted-foreground">Stock Out</span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

// Helper function to process movements for chart
function processMovementsForChart(_movements: StockMovement[]) {
    // Generate last 7 days with mock data
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return days.map((day) => ({
        date: day,
        in: Math.floor(Math.random() * 100) + 50,
        out: Math.floor(Math.random() * 80) + 30,
    }));
}

// ============================================
// Inventory Status Widget
// ============================================
function InventoryStatusWidget({ stats }: { stats: DashboardStats }) {
    const healthyStock = Math.max(0, stats.productCount - stats.lowStockCount);
    const total = stats.productCount || 1;

    const statusItems = [
        {
            label: 'Low Stock Items',
            count: stats.lowStockCount,
            percentage: (stats.lowStockCount / total) * 100,
            color: 'bg-destructive',
            textColor: 'text-destructive'
        },
        {
            label: 'Healthy Stock',
            count: healthyStock,
            percentage: (healthyStock / total) * 100,
            color: 'bg-emerald-500',
            textColor: 'text-emerald-600'
        },
        {
            label: 'Recent Movements (24h)',
            count: stats.recentMovements,
            percentage: Math.min(100, (stats.recentMovements / 50) * 100),
            color: 'bg-amber-500',
            textColor: 'text-amber-600'
        },
    ];

    return (
        <Card>
            <CardHeader className="pb-4">
                <CardTitle className="text-lg font-medium flex items-center gap-2">
                    <PackageCheck className="h-5 w-5 text-muted-foreground" />
                    Inventory Status
                </CardTitle>
                <CardAction>
                    <Link href="/dashboard/inventory">
                        <Button variant="ghost" size="icon-sm">
                            <ArrowUpRight className="h-4 w-4" />
                        </Button>
                    </Link>
                </CardAction>
            </CardHeader>
            <CardContent className="space-y-5">
                {statusItems.map((item, index) => (
                    <div key={index} className="space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">{item.label}</span>
                            <span className={`text-sm font-medium ${item.textColor}`}>
                                {item.count}
                            </span>
                        </div>
                        <div className="h-2 rounded-full bg-secondary overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all ${item.color}`}
                                style={{ width: `${item.percentage}%` }}
                            />
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}

// ============================================
// Low Stock Alerts Widget
// ============================================
function LowStockAlertsWidget({ lowStockCount }: { lowStockCount: number }) {
    return (
        <Card>
            <CardHeader className="pb-4">
                <CardTitle className="text-lg font-medium flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    Low Stock Alerts
                </CardTitle>
                <CardAction>
                    <Link href="/dashboard/inventory?lowStock=true">
                        <Button variant="ghost" size="icon-sm">
                            <ArrowUpRight className="h-4 w-4" />
                        </Button>
                    </Link>
                </CardAction>
            </CardHeader>
            <CardContent>
                {lowStockCount === 0 ? (
                    <div className="text-center py-6">
                        <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-3">
                            <PackageCheck className="h-6 w-6 text-emerald-600" />
                        </div>
                        <p className="text-sm font-medium text-foreground">All Good!</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            No items below threshold
                        </p>
                    </div>
                ) : (
                    <div className="text-center py-4">
                        <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-3">
                            <span className="text-2xl font-bold text-amber-600">{lowStockCount}</span>
                        </div>
                        <p className="text-sm font-medium text-foreground">Items Need Attention</p>
                        <p className="text-xs text-muted-foreground mt-1 mb-4">
                            Below minimum threshold
                        </p>
                        <Link href="/dashboard/inventory?lowStock=true">
                            <Button variant="outline" size="sm" className="w-full">
                                View All
                            </Button>
                        </Link>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

// ============================================
// Quick Actions Widget
// ============================================
function QuickActionsWidget() {
    const actions = [
        {
            label: 'Product Catalog',
            href: '/dashboard/products',
            icon: Package,
            color: 'bg-blue-500/10 text-blue-600',
        },
        {
            label: 'Production Analysis',
            href: '/dashboard/production/analytics',
            icon: Factory,
            color: 'bg-purple-500/10 text-purple-600',
        },
        {
            label: 'Sales Insights',
            href: '/dashboard/sales/analytics',
            icon: TrendingUp,
            color: 'bg-emerald-500/10 text-emerald-600',
        },
        {
            label: 'Purchasing Insights',
            href: '/dashboard/purchasing/analytics',
            icon: ShoppingCart,
            color: 'bg-amber-500/10 text-amber-600',
        },
    ];

    return (
        <Card>
            <CardHeader className="pb-4">
                <CardTitle className="text-lg font-medium">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-2 gap-3">
                    {actions.map((action, index) => (
                        <Link key={index} href={action.href}>
                            <div className="flex flex-col items-center gap-2 p-4 rounded-xl border bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer h-full">
                                <div className={`p-2.5 rounded-lg ${action.color}`}>
                                    <action.icon className="h-5 w-5" />
                                </div>
                                <span className="text-xs font-medium text-foreground text-center">{action.label}</span>
                            </div>
                        </Link>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
