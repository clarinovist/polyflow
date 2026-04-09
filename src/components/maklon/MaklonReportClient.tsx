'use client';

import { useState, useTransition } from 'react';
import { getMaklonReport } from '@/actions/maklon/maklon-report';
import { formatRupiah } from '@/lib/utils/utils';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    ChevronDown,
    ChevronRight,
    TrendingUp,
    TrendingDown,
    DollarSign,
    Wrench,
    Users,
    RefreshCw,
    Factory,
    Zap,
    Layers,
    BarChart3,
    Receipt,
    ExternalLink,
} from 'lucide-react';
import Link from 'next/link';

// ---- Types mirroring the service (serialized) ----
type CostBreakdown = {
    LABOR: number;
    MACHINE: number;
    ELECTRICITY: number;
    ADDITIVE: number;
    COLORANT: number;
    OVERHEAD: number;
    OTHER: number;
};

type OrderReport = {
    productionOrderId: string;
    productionOrderNumber: string;
    productionStatus: string;
    salesOrderId: string | null;
    salesOrderNumber: string | null;
    salesOrderStatus: string | null;
    invoiced: boolean;
    invoiceNumber: string | null;
    invoiceStatus: string | null;
    serviceRevenue: number;
    totalInternalCost: number;
    grossMargin: number;
    grossMarginPct: number;
    costBreakdown: CostBreakdown;
    plannedStartDate: string;
    actualEndDate: string | null;
};

type CustomerReport = {
    customerId: string;
    customerName: string;
    orderCount: number;
    totalServiceRevenue: number;
    totalInternalCost: number;
    totalGrossMargin: number;
    avgMarginPct: number;
    orders: OrderReport[];
};

type ReportSummary = {
    totalOrders: number;
    totalServiceRevenue: number;
    totalInternalCost: number;
    totalGrossMargin: number;
    avgMarginPct: number;
    byCustomer: CustomerReport[];
    totalCostBreakdown: CostBreakdown;
};

// ---- Sub-components ----

function MarginBadge({ pct }: { pct: number }) {
    if (pct >= 30)
        return (
            <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 border">
                <TrendingUp className="w-3 h-3 mr-1" />
                {pct.toFixed(1)}%
            </Badge>
        );
    if (pct >= 0)
        return (
            <Badge className="bg-amber-50 text-amber-700 border-amber-200 border">
                <TrendingUp className="w-3 h-3 mr-1 opacity-60" />
                {pct.toFixed(1)}%
            </Badge>
        );
    return (
        <Badge variant="destructive" className="border">
            <TrendingDown className="w-3 h-3 mr-1" />
            {pct.toFixed(1)}%
        </Badge>
    );
}

function InvoiceStatusBadge({ invoiced, status }: { invoiced: boolean; status: string | null }) {
    if (!invoiced)
        return (
            <Badge variant="outline" className="text-slate-500">
                Not Invoiced
            </Badge>
        );
    const colors: Record<string, string> = {
        PAID: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        PARTIAL: 'bg-amber-50 text-amber-700 border-amber-200',
        UNPAID: 'bg-amber-50 text-amber-700 border-amber-200',
        DRAFT: 'bg-slate-50 text-slate-700 border-slate-200',
        OVERDUE: 'bg-red-50 text-red-700 border-red-200',
        CANCELLED: 'bg-gray-50 text-gray-700 border-gray-200',
    };
    return (
        <Badge className={`border ${colors[status ?? ''] ?? colors.DRAFT}`}>
            <Receipt className="w-3 h-3 mr-1" />
            {status}
        </Badge>
    );
}

const COST_TYPE_ICON: Record<string, React.ReactNode> = {
    LABOR: <Users className="w-3 h-3" />,
    MACHINE: <Wrench className="w-3 h-3" />,
    ELECTRICITY: <Zap className="w-3 h-3" />,
    ADDITIVE: <Layers className="w-3 h-3" />,
    COLORANT: <Factory className="w-3 h-3" />,
    OVERHEAD: <BarChart3 className="w-3 h-3" />,
    OTHER: <DollarSign className="w-3 h-3" />,
};

function CostBreakdownBar({ breakdown, total }: { breakdown: CostBreakdown; total: number }) {
    const colors = [
        'bg-primary',
        'bg-primary/80',
        'bg-primary/70',
        'bg-primary/60',
        'bg-primary/50',
        'bg-primary/40',
        'bg-primary/30',
    ];
    const entries = Object.entries(breakdown).filter(([, v]) => v > 0);

    return (
        <div>
            <div className="flex rounded-full overflow-hidden h-2 gap-px">
                {entries.map(([key, val], i) => {
                    const pct = total > 0 ? (val / total) * 100 : 0;
                    return (
                        <div
                            key={key}
                            className={colors[i % colors.length]}
                            style={{ width: `${pct}%` }}
                            title={`${key}: ${formatRupiah(val)}`}
                        />
                    );
                })}
                {total === 0 && <div className="bg-slate-200 w-full" />}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                {entries.map(([key, val], i) => (
                    <div key={key} className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span
                            className={`inline-block w-2 h-2 rounded-full ${colors[i % colors.length]}`}
                        />
                        {COST_TYPE_ICON[key]}
                        <span className="capitalize">{key.toLowerCase()}</span>
                        <span className="font-medium text-foreground">{formatRupiah(val)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function OrderRow({ order }: { order: OrderReport }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <>
            <tr
                className="border-b hover:bg-muted/30 transition-colors cursor-pointer"
                onClick={() => setExpanded((p) => !p)}
            >
                <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                        {expanded ? (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        ) : (
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        )}
                        <span className="font-mono text-sm font-medium">
                            {order.productionOrderNumber}
                        </span>
                    </div>
                </td>
                <td className="px-4 py-3">
                    {order.salesOrderNumber ? (
                        <Link
                            href={`/sales/orders/${order.salesOrderId}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                        >
                            {order.salesOrderNumber}
                            <ExternalLink className="w-3 h-3" />
                        </Link>
                    ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                    )}
                </td>
                <td className="px-4 py-3 text-sm text-right font-medium">
                    {formatRupiah(order.serviceRevenue)}
                </td>
                <td className="px-4 py-3 text-sm text-right text-muted-foreground">
                    {formatRupiah(order.totalInternalCost)}
                </td>
                <td className="px-4 py-3 text-sm text-right font-semibold">
                    <span className={order.grossMargin >= 0 ? '' : 'text-red-600'}>
                        {formatRupiah(order.grossMargin)}
                    </span>
                </td>
                <td className="px-4 py-3 text-right">
                    <MarginBadge pct={order.grossMarginPct} />
                </td>
                <td className="px-4 py-3">
                    <InvoiceStatusBadge invoiced={order.invoiced} status={order.invoiceStatus} />
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                    {format(new Date(order.plannedStartDate), 'dd MMM yyyy')}
                </td>
            </tr>
            {expanded && (
                <tr className="bg-muted/20 border-b">
                    <td colSpan={8} className="px-8 py-4">
                        <div className="space-y-2">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                Internal Cost Breakdown
                            </p>
                            <CostBreakdownBar
                                breakdown={order.costBreakdown}
                                total={order.totalInternalCost}
                            />
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
}

function CustomerSection({ customer }: { customer: CustomerReport }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <Card className="overflow-hidden">
            <CardHeader
                className="cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => setExpanded((p) => !p)}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {expanded ? (
                            <ChevronDown className="w-5 h-5 text-muted-foreground" />
                        ) : (
                            <ChevronRight className="w-5 h-5 text-muted-foreground" />
                        )}
                        <div>
                            <CardTitle className="text-lg">{customer.customerName}</CardTitle>
                            <CardDescription>
                                {customer.orderCount} production order
                                {customer.orderCount !== 1 ? 's' : ''}
                            </CardDescription>
                        </div>
                    </div>
                    <div className="flex items-center gap-6 text-right">
                        <div>
                            <p className="text-xs text-muted-foreground mb-0.5">Revenue</p>
                            <p className="font-semibold">{formatRupiah(customer.totalServiceRevenue)}</p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground mb-0.5">Int. Cost</p>
                            <p className="font-semibold text-muted-foreground">
                                {formatRupiah(customer.totalInternalCost)}
                            </p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground mb-0.5">Margin</p>
                            <p
                                className={`font-bold ${
                                    customer.totalGrossMargin >= 0
                                        ? ''
                                        : 'text-red-600'
                                }`}
                            >
                                {formatRupiah(customer.totalGrossMargin)}
                            </p>
                        </div>
                        <MarginBadge pct={customer.avgMarginPct} />
                    </div>
                </div>
            </CardHeader>

            {expanded && (
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/40 border-t border-b">
                                <tr>
                                    <th className="px-4 py-2 text-left font-medium text-muted-foreground text-xs uppercase">
                                        Production Order
                                    </th>
                                    <th className="px-4 py-2 text-left font-medium text-muted-foreground text-xs uppercase">
                                        Sales Order
                                    </th>
                                    <th className="px-4 py-2 text-right font-medium text-muted-foreground text-xs uppercase">
                                        Revenue
                                    </th>
                                    <th className="px-4 py-2 text-right font-medium text-muted-foreground text-xs uppercase">
                                        Int. Cost
                                    </th>
                                    <th className="px-4 py-2 text-right font-medium text-muted-foreground text-xs uppercase">
                                        Gross Margin
                                    </th>
                                    <th className="px-4 py-2 text-right font-medium text-muted-foreground text-xs uppercase">
                                        Margin %
                                    </th>
                                    <th className="px-4 py-2 text-left font-medium text-muted-foreground text-xs uppercase">
                                        Invoice
                                    </th>
                                    <th className="px-4 py-2 text-left font-medium text-muted-foreground text-xs uppercase">
                                        Date
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {customer.orders.map((order) => (
                                    <OrderRow key={order.productionOrderId} order={order} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            )}
        </Card>
    );
}

// ---- Main Component ----

interface MaklonReportClientProps {
    initialReport: ReportSummary;
    customers: { id: string; name: string }[];
}

export function MaklonReportClient({ initialReport, customers }: MaklonReportClientProps) {
    const [report, setReport] = useState<ReportSummary>(initialReport);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [customerId, setCustomerId] = useState('');
    const [isPending, startTransition] = useTransition();

    const handleFilter = () => {
        startTransition(async () => {
            const res = await getMaklonReport({
                startDate: startDate || undefined,
                endDate: endDate || undefined,
                customerId: customerId || undefined,
            });
            if (res.success && res.data) {
                setReport(res.data as ReportSummary);
            }
        });
    };

    const handleReset = () => {
        setStartDate('');
        setEndDate('');
        setCustomerId('');
        startTransition(async () => {
            const res = await getMaklonReport();
            if (res.success && res.data) setReport(res.data as ReportSummary);
        });
    };

    const marginColor =
        report.totalGrossMargin >= 0 ? '' : 'text-red-600';

    return (
        <div className="space-y-6">
            {/* Filter Bar */}
            <Card>
                <CardContent className="pt-5 pb-4">
                    <div className="flex flex-wrap gap-3 items-end">
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-medium text-muted-foreground">
                                Start Date
                            </label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="h-9 px-3 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-medium text-muted-foreground">
                                End Date
                            </label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="h-9 px-3 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-medium text-muted-foreground">
                                Customer
                            </label>
                            <select
                                value={customerId}
                                onChange={(e) => setCustomerId(e.target.value)}
                                className="h-9 px-3 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring min-w-[180px]"
                            >
                                <option value="">All Customers</option>
                                {customers.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <Button onClick={handleFilter} disabled={isPending} className="h-9">
                            {isPending ? (
                                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                                <BarChart3 className="w-4 h-4 mr-2" />
                            )}
                            Apply Filter
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={handleReset}
                            disabled={isPending}
                            className="h-9"
                        >
                            Reset
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Summary KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Total Orders
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">{report.totalOrders}</div>
                        <p className="text-xs text-muted-foreground mt-1">Maklon production runs</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <DollarSign className="w-4 h-4" /> Service Revenue
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {formatRupiah(report.totalServiceRevenue)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">From Sales Orders</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <Wrench className="w-4 h-4" /> Internal Costs
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-muted-foreground">
                            {formatRupiah(report.totalInternalCost)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Labor, machine & others</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <TrendingUp className="w-4 h-4" /> Gross Margin
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${marginColor}`}>
                            {formatRupiah(report.totalGrossMargin)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Avg{' '}
                            <span className={`font-semibold ${marginColor}`}>
                                {report.avgMarginPct.toFixed(1)}%
                            </span>{' '}
                            margin
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Cost Breakdown Overview */}
            {report.totalInternalCost > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <BarChart3 className="w-4 h-4 text-muted-foreground" />
                            Overall Cost Breakdown
                        </CardTitle>
                        <CardDescription>
                            Distribution of internal conversion costs across all Maklon orders
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <CostBreakdownBar
                            breakdown={report.totalCostBreakdown}
                            total={report.totalInternalCost}
                        />
                    </CardContent>
                </Card>
            )}

            {/* Per-Customer Sections */}
            <div className="space-y-4">
                <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
                    <Users className="w-5 h-5 text-muted-foreground" />
                    By Customer ({report.byCustomer.length})
                </h2>

                {report.byCustomer.length === 0 ? (
                    <Card>
                        <CardContent className="py-16 text-center">
                            <Factory className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                            <p className="text-muted-foreground font-medium">
                                No Maklon orders found
                            </p>
                            <p className="text-sm text-muted-foreground mt-1">
                                Try adjusting the date range or customer filter.
                            </p>
                        </CardContent>
                    </Card>
                ) : (
                    report.byCustomer.map((customer) => (
                        <CustomerSection key={customer.customerId} customer={customer} />
                    ))
                )}
            </div>
        </div>
    );
}
