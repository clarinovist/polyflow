'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { formatRupiah } from '@/lib/utils/utils';
import {
    AlertTriangle,
    TrendingDown,
    TrendingUp,
    Package,
    Users,
    UserCircle,
    FileText,
} from 'lucide-react';

type SummaryClient = {
    totalRevenue: number;
    totalCost: number;
    totalMargin: number;
    marginPercent: number | null;
    totalOrders: number;
    totalCustomerCount: number;
    ordersWithIncompleteHpp: number;
    ordersWithNoHpp: number;
    variantWithoutHppCount: number;
};

type MarginItemClient = {
    productVariantId: string;
    skuCode: string | null;
    productName: string;
    quantity: number;
    revenue: number;
    hppPerUnit: number | null;
    cost: number | null;
    margin: number | null;
    hppMissing: boolean;
};

type MarginOrderClient = {
    id: string;
    orderNumber: string;
    orderDate: string | Date;
    customerId: string;
    customerName: string;
    salesRepId: string | null;
    salesRepName: string | null;
    items: MarginItemClient[];
    revenue: number;
    cost: number | null;
    costPartial: number;
    margin: number | null;
    marginPartial: number | null;
    marginPercent: number | null;
    hppCoverage: 'FULL' | 'PARTIAL' | 'NONE';
    hasIncompleteHpp: boolean;
};

type MarginCustomerClient = {
    customerId: string;
    customerName: string;
    revenue: number;
    cost: number;
    margin: number;
    marginPercent: number | null;
    isNegativeMargin: boolean;
    orderCount: number;
    hppCoverage: 'FULL' | 'PARTIAL' | 'NONE';
    ordersWithIncompleteHpp: number;
};

type MarginProductClient = {
    productVariantId: string;
    skuCode: string | null;
    productName: string;
    quantity: number;
    revenue: number;
    cost: number | null;
    margin: number | null;
    marginPercent: number | null;
    isNegativeMargin: boolean;
    hasMissingHpp: boolean;
    orderCount: number;
};

type MarginSalesClient = {
    salesRepId: string;
    salesRepName: string;
    revenue: number;
    cost: number;
    margin: number;
    marginPercent: number | null;
    isNegativeMargin: boolean;
    orderCount: number;
    hppCoverage: 'FULL' | 'PARTIAL' | 'NONE';
    ordersWithIncompleteHpp: number;
};

type MarginReportClientData = {
    startDate: string | Date;
    endDate: string | Date;
    summary: SummaryClient;
    orders: MarginOrderClient[];
    byCustomer: MarginCustomerClient[];
    byProduct: MarginProductClient[];
    bySales: MarginSalesClient[];
    hppMap: { variantId: string; hppPerUnit: number; totalQuantity: number }[];
    variantWithoutHpp: string[];
};

function HppCoverageBadge({
    coverage,
}: {
    coverage: 'FULL' | 'PARTIAL' | 'NONE';
}) {
    if (coverage === 'FULL') return null;
    if (coverage === 'PARTIAL') {
        return (
            <Badge
                variant="outline"
                className="bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800/50 text-[11px]"
            >
                <AlertTriangle className="h-3 w-3 mr-1" />
                HPP tidak lengkap
            </Badge>
        );
    }
    return (
        <Badge
            variant="outline"
            className="bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800/50 text-[11px]"
        >
            HPP tidak tersedia
        </Badge>
    );
}

function MarginCell({ value }: { value: number | null }) {
    if (value == null) {
        return <span className="text-muted-foreground text-xs">—</span>;
    }
    const negative = value < 0;
    return (
        <span
            className={
                negative
                    ? 'text-red-600 dark:text-red-400 font-semibold'
                    : 'font-medium'
            }
        >
            {formatRupiah(value)}
            {negative && <TrendingDown className="inline h-3 w-3 ml-1" />}
        </span>
    );
}

function MarginPercentCell({ value }: { value: number | null }) {
    if (value == null) {
        return <span className="text-muted-foreground text-xs">—</span>;
    }
    const negative = value < 0;
    return (
        <span
            className={
                negative
                    ? 'text-red-600 dark:text-red-400 font-semibold tabular-nums'
                    : 'tabular-nums font-medium'
            }
        >
            {value.toFixed(1)}%
        </span>
    );
}

export function MarginReportClient({
    data,
    periodLabel,
}: {
    data: MarginReportClientData;
    periodLabel: string;
}) {
    const [activeTab, setActiveTab] = useState<
        'summary' | 'customer' | 'product' | 'sales' | 'detail'
    >('summary');

    const sortedOrders = useMemo(() => {
        return [...data.orders].sort((a, b) => b.revenue - a.revenue);
    }, [data.orders]);

    const summary = data.summary;

    return (
        <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-emerald-600" />
                            Total Pendapatan
                        </CardTitle>
                        <CardDescription className="text-xs">
                            {periodLabel}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl font-bold">
                            {formatRupiah(summary.totalRevenue)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {summary.totalOrders} SO ·{' '}
                            {summary.totalCustomerCount} customer
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Package className="h-4 w-4 text-slate-600" />
                            Total HPP
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Dari PO COMPLETED/IN_PROGRESS periode ini
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl font-bold">
                            {formatRupiah(summary.totalCost)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {summary.ordersWithIncompleteHpp} SO parsial ·{' '}
                            {summary.ordersWithNoHpp} SO tanpa HPP
                        </p>
                        {summary.variantWithoutHppCount > 0 && (
                            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                                {summary.variantWithoutHppCount} varian tanpa
                                produksi di periode ini
                            </p>
                        )}
                    </CardContent>
                </Card>

                <Card
                    className={
                        summary.totalMargin < 0
                            ? 'border-red-200 bg-red-50/40 dark:border-red-800/50 dark:bg-red-950/10'
                            : ''
                    }
                >
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <TrendingUp
                                className={`h-4 w-4 ${summary.totalMargin < 0 ? 'text-red-600' : 'text-emerald-600'}`}
                            />
                            Total Margin
                        </CardTitle>
                        <CardDescription className="text-xs">
                            {summary.marginPercent != null
                                ? `${summary.marginPercent.toFixed(1)}% dari pendapatan`
                                : '—'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div
                            className={`text-xl font-bold ${summary.totalMargin < 0 ? 'text-red-600 dark:text-red-400' : ''}`}
                        >
                            {formatRupiah(summary.totalMargin)}
                        </div>
                        {summary.totalMargin < 0 && (
                            <Badge
                                variant="outline"
                                className="mt-2 bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800/50 text-[11px]"
                            >
                                Margin negatif
                            </Badge>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">
                            Kelengkapan HPP
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Laporan ini TIDAK fallback ke standardCost
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span>HPP lengkap</span>
                            <span className="font-medium">
                                {summary.totalOrders -
                                    summary.ordersWithIncompleteHpp -
                                    summary.ordersWithNoHpp}{' '}
                                SO
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-amber-700 dark:text-amber-400">
                                HPP tidak lengkap
                            </span>
                            <span className="font-medium">
                                {summary.ordersWithIncompleteHpp} SO
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-amber-700 dark:text-amber-400">
                                HPP tidak tersedia
                            </span>
                            <span className="font-medium">
                                {summary.ordersWithNoHpp} SO
                            </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground pt-1 border-t">
                            Varian tanpa PO di periode ini = HPP &quot;tidak
                            tersedia&quot;, bukan margin 0/100%.
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Tabs */}
            <Tabs
                value={activeTab}
                onValueChange={(v) =>
                    setActiveTab(
                        v as
                            | 'summary'
                            | 'customer'
                            | 'product'
                            | 'sales'
                            | 'detail',
                    )
                }
            >
                <TabsList className="flex flex-wrap h-auto">
                    <TabsTrigger value="summary">Ringkasan</TabsTrigger>
                    <TabsTrigger value="customer">
                        <Users className="h-3.5 w-3.5 mr-1.5" />
                        Per Customer
                    </TabsTrigger>
                    <TabsTrigger value="product">
                        <Package className="h-3.5 w-3.5 mr-1.5" />
                        Per Produk
                    </TabsTrigger>
                    <TabsTrigger value="sales">
                        <UserCircle className="h-3.5 w-3.5 mr-1.5" />
                        Per Sales
                    </TabsTrigger>
                    <TabsTrigger value="detail">
                        <FileText className="h-3.5 w-3.5 mr-1.5" />
                        Detail SO
                    </TabsTrigger>
                </TabsList>

                {/* Summary: second row of context */}
                <TabsContent value="summary" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm">
                                Catatan Metodologi
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-muted-foreground space-y-2">
                            <p>
                                • <strong>HPP sumber:</strong> rata-rata
                                tertimbang per varian dari production order
                                COMPLETED/IN_PROGRESS yang{' '}
                                <code>updatedAt</code> dalam periode laporan.
                                Order kecil tidak menyamakan bobot dengan order
                                besar (dibagi total quantity, bukan jumlah
                                order).
                            </p>
                            <p>
                                • <strong>SO scope:</strong> status ≠ CANCELLED,
                                punya customerId (exclude internal stock build
                                legacy), orderDate dalam periode.
                            </p>
                            <p>
                                • <strong>Pendapatan per baris:</strong>{' '}
                                <code>SalesOrderItem.subtotal</code> (sudah
                                termasuk diskon).
                            </p>
                            <p>
                                • <strong>Tanpa HPP:</strong> jika varian tidak
                                ada di map HPP periode ini, HPP = tidak tersedia
                                — <strong>jangan</strong> dianggap cost 0 (akan
                                tampak margin 100%) atau margin 0.
                            </p>
                            <p>
                                • <strong>Margin negatif:</strong> ditampilkan
                                apa adanya (merah), tidak di-clamp.
                            </p>
                            <p>
                                • <strong>Guard:</strong> laporan ini hanya
                                untuk ADMIN, MARKETING, FINANCE.
                            </p>
                        </CardContent>
                    </Card>

                    {data.hppMap.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-sm">
                                    HPP per Varian (periode ini)
                                </CardTitle>
                                <CardDescription className="text-xs">
                                    Rata-rata tertimbang dari production order
                                    dalam periode
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="rounded-lg border overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead className="bg-muted/50 border-b">
                                            <tr>
                                                <th className="h-9 px-3 text-left font-medium">
                                                    Variant ID
                                                </th>
                                                <th className="h-9 px-3 text-right font-medium">
                                                    HPP / unit
                                                </th>
                                                <th className="h-9 px-3 text-right font-medium">
                                                    Total Qty Produksi
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.hppMap.map((row) => (
                                                <tr
                                                    key={row.variantId}
                                                    className="border-b last:border-0"
                                                >
                                                    <td className="px-3 py-2 font-mono text-xs truncate max-w-[200px]">
                                                        {row.variantId}
                                                    </td>
                                                    <td className="px-3 py-2 text-right tabular-nums">
                                                        {formatRupiah(
                                                            row.hppPerUnit,
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2 text-right tabular-nums">
                                                        {row.totalQuantity}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>

                <TabsContent value="customer">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm">
                                Margin Per Customer
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-lg border overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Customer</TableHead>
                                            <TableHead className="text-right">
                                                Pendapatan
                                            </TableHead>
                                            <TableHead className="text-right">
                                                HPP
                                            </TableHead>
                                            <TableHead className="text-right">
                                                Margin
                                            </TableHead>
                                            <TableHead className="text-right">
                                                %
                                            </TableHead>
                                            <TableHead className="text-right">
                                                SO
                                            </TableHead>
                                            <TableHead>Status HPP</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {data.byCustomer.length === 0 ? (
                                            <TableRow>
                                                <TableCell
                                                    colSpan={7}
                                                    className="text-center text-muted-foreground py-8"
                                                >
                                                    Tidak ada data.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            data.byCustomer.map((row) => (
                                                <TableRow
                                                    key={row.customerId}
                                                    className={
                                                        row.isNegativeMargin
                                                            ? 'bg-red-50/50 dark:bg-red-950/10'
                                                            : ''
                                                    }
                                                >
                                                    <TableCell className="font-medium">
                                                        {row.customerName}
                                                    </TableCell>
                                                    <TableCell className="text-right tabular-nums">
                                                        {formatRupiah(
                                                            row.revenue,
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right tabular-nums">
                                                        {formatRupiah(row.cost)}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <MarginCell
                                                            value={row.margin}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <MarginPercentCell
                                                            value={
                                                                row.marginPercent
                                                            }
                                                        />
                                                    </TableCell>
                                                    <TableCell className="text-right tabular-nums">
                                                        {row.orderCount}
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <HppCoverageBadge
                                                                coverage={
                                                                    row.hppCoverage
                                                                }
                                                            />
                                                            {row.isNegativeMargin && (
                                                                <Badge
                                                                    variant="outline"
                                                                    className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800/50 text-[11px]"
                                                                >
                                                                    Margin
                                                                    negatif
                                                                </Badge>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="product">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm">
                                Margin Per Produk
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Dikelompokkan per varian produk
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-lg border overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Produk / SKU</TableHead>
                                            <TableHead className="text-right">
                                                Qty
                                            </TableHead>
                                            <TableHead className="text-right">
                                                Pendapatan
                                            </TableHead>
                                            <TableHead className="text-right">
                                                HPP
                                            </TableHead>
                                            <TableHead className="text-right">
                                                Margin
                                            </TableHead>
                                            <TableHead className="text-right">
                                                %
                                            </TableHead>
                                            <TableHead>Status HPP</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {data.byProduct.length === 0 ? (
                                            <TableRow>
                                                <TableCell
                                                    colSpan={7}
                                                    className="text-center text-muted-foreground py-8"
                                                >
                                                    Tidak ada data.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            data.byProduct.map((row) => (
                                                <TableRow
                                                    key={row.productVariantId}
                                                    className={
                                                        row.isNegativeMargin
                                                            ? 'bg-red-50/50 dark:bg-red-950/10'
                                                            : ''
                                                    }
                                                >
                                                    <TableCell>
                                                        <div className="font-medium">
                                                            {row.productName}
                                                        </div>
                                                        {row.skuCode && (
                                                            <div className="text-[11px] text-muted-foreground font-mono">
                                                                {row.skuCode}
                                                            </div>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right tabular-nums">
                                                        {row.quantity}
                                                    </TableCell>
                                                    <TableCell className="text-right tabular-nums">
                                                        {formatRupiah(
                                                            row.revenue,
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right tabular-nums">
                                                        {row.cost != null ? (
                                                            formatRupiah(
                                                                row.cost,
                                                            )
                                                        ) : (
                                                            <span className="text-muted-foreground text-xs">
                                                                —
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <MarginCell
                                                            value={row.margin}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <MarginPercentCell
                                                            value={
                                                                row.marginPercent
                                                            }
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            {row.hasMissingHpp && (
                                                                <Badge
                                                                    variant="outline"
                                                                    className="bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800/50 text-[11px]"
                                                                >
                                                                    HPP tidak
                                                                    tersedia
                                                                    (parsial)
                                                                </Badge>
                                                            )}
                                                            {row.isNegativeMargin && (
                                                                <Badge
                                                                    variant="outline"
                                                                    className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800/50 text-[11px]"
                                                                >
                                                                    Margin
                                                                    negatif
                                                                </Badge>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="sales">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm">
                                Margin Per Sales
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Termasuk bucket &quot;Tanpa Sales&quot; untuk SO
                                tanpa salesRepId
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-lg border overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Sales</TableHead>
                                            <TableHead className="text-right">
                                                Pendapatan
                                            </TableHead>
                                            <TableHead className="text-right">
                                                HPP
                                            </TableHead>
                                            <TableHead className="text-right">
                                                Margin
                                            </TableHead>
                                            <TableHead className="text-right">
                                                %
                                            </TableHead>
                                            <TableHead className="text-right">
                                                SO
                                            </TableHead>
                                            <TableHead>Status HPP</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {data.bySales.length === 0 ? (
                                            <TableRow>
                                                <TableCell
                                                    colSpan={7}
                                                    className="text-center text-muted-foreground py-8"
                                                >
                                                    Tidak ada data.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            data.bySales.map((row) => (
                                                <TableRow
                                                    key={row.salesRepId}
                                                    className={
                                                        row.isNegativeMargin
                                                            ? 'bg-red-50/50 dark:bg-red-950/10'
                                                            : ''
                                                    }
                                                >
                                                    <TableCell className="font-medium">
                                                        {row.salesRepName}
                                                    </TableCell>
                                                    <TableCell className="text-right tabular-nums">
                                                        {formatRupiah(
                                                            row.revenue,
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right tabular-nums">
                                                        {formatRupiah(row.cost)}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <MarginCell
                                                            value={row.margin}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <MarginPercentCell
                                                            value={
                                                                row.marginPercent
                                                            }
                                                        />
                                                    </TableCell>
                                                    <TableCell className="text-right tabular-nums">
                                                        {row.orderCount}
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <HppCoverageBadge
                                                                coverage={
                                                                    row.hppCoverage
                                                                }
                                                            />
                                                            {row.isNegativeMargin && (
                                                                <Badge
                                                                    variant="outline"
                                                                    className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800/50 text-[11px]"
                                                                >
                                                                    Margin
                                                                    negatif
                                                                </Badge>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="detail">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm">
                                Detail SO — Margin Per Order
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Urut pendapatan tertinggi. Klik nomor SO untuk
                                buka detail.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-lg border overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>SO</TableHead>
                                            <TableHead>Customer</TableHead>
                                            <TableHead>Sales</TableHead>
                                            <TableHead className="text-right">
                                                Pendapatan
                                            </TableHead>
                                            <TableHead className="text-right">
                                                HPP
                                            </TableHead>
                                            <TableHead className="text-right">
                                                Margin
                                            </TableHead>
                                            <TableHead className="text-right">
                                                %
                                            </TableHead>
                                            <TableHead>Status HPP</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {sortedOrders.length === 0 ? (
                                            <TableRow>
                                                <TableCell
                                                    colSpan={8}
                                                    className="text-center text-muted-foreground py-8"
                                                >
                                                    Tidak ada sales order di
                                                    periode ini.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            sortedOrders.map((o) => (
                                                <TableRow
                                                    key={o.id}
                                                    className={
                                                        (o.margin != null &&
                                                            o.margin < 0) ||
                                                        (o.marginPartial !=
                                                            null &&
                                                            o.marginPartial < 0)
                                                            ? 'bg-red-50/50 dark:bg-red-950/10'
                                                            : ''
                                                    }
                                                >
                                                    <TableCell>
                                                        <Link
                                                            href={`/sales/orders/${o.id}`}
                                                            className="font-medium text-primary hover:underline"
                                                        >
                                                            {o.orderNumber}
                                                        </Link>
                                                    </TableCell>
                                                    <TableCell className="max-w-[180px] truncate">
                                                        {o.customerName}
                                                    </TableCell>
                                                    <TableCell className="max-w-[120px] truncate text-xs">
                                                        {o.salesRepName ?? (
                                                            <span className="text-muted-foreground">
                                                                —
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right tabular-nums">
                                                        {formatRupiah(
                                                            o.revenue,
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right tabular-nums">
                                                        {o.cost != null ? (
                                                            formatRupiah(o.cost)
                                                        ) : o.costPartial >
                                                          0 ? (
                                                            <span title="HPP parsial — sebagian item tanpa HPP">
                                                                {formatRupiah(
                                                                    o.costPartial,
                                                                )}{' '}
                                                                <span className="text-[10px] text-amber-600">
                                                                    (parsial)
                                                                </span>
                                                            </span>
                                                        ) : (
                                                            <span className="text-muted-foreground text-xs">
                                                                —
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {o.margin != null ? (
                                                            <MarginCell
                                                                value={o.margin}
                                                            />
                                                        ) : o.marginPartial !=
                                                          null ? (
                                                            <span title="Margin parsial">
                                                                <MarginCell
                                                                    value={
                                                                        o.marginPartial
                                                                    }
                                                                />{' '}
                                                                <span className="text-[10px] text-amber-600">
                                                                    (parsial)
                                                                </span>
                                                            </span>
                                                        ) : (
                                                            <span className="text-muted-foreground text-xs">
                                                                —
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <MarginPercentCell
                                                            value={
                                                                o.marginPercent
                                                            }
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        <HppCoverageBadge
                                                            coverage={
                                                                o.hppCoverage
                                                            }
                                                        />
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>

                            {/* Item drill-down */}
                            {sortedOrders.length > 0 && (
                                <div className="mt-6">
                                    <h4 className="text-sm font-semibold mb-3">
                                        Rincian Item (SO terpilih — 10 SO
                                        teratas)
                                    </h4>
                                    <div className="space-y-4">
                                        {sortedOrders.slice(0, 10).map((o) => (
                                            <div
                                                key={`items-${o.id}`}
                                                className="rounded-lg border p-3"
                                            >
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-sm font-medium">
                                                        {o.orderNumber} —{' '}
                                                        {o.customerName}
                                                    </span>
                                                    <HppCoverageBadge
                                                        coverage={o.hppCoverage}
                                                    />
                                                </div>
                                                <div className="rounded border overflow-hidden">
                                                    <table className="w-full text-xs">
                                                        <thead className="bg-muted/50 border-b">
                                                            <tr>
                                                                <th className="h-7 px-2 text-left font-medium">
                                                                    Produk
                                                                </th>
                                                                <th className="h-7 px-2 text-right font-medium">
                                                                    Qty
                                                                </th>
                                                                <th className="h-7 px-2 text-right font-medium">
                                                                    Subtotal
                                                                </th>
                                                                <th className="h-7 px-2 text-right font-medium">
                                                                    HPP/u
                                                                </th>
                                                                <th className="h-7 px-2 text-right font-medium">
                                                                    HPP total
                                                                </th>
                                                                <th className="h-7 px-2 text-right font-medium">
                                                                    Margin
                                                                </th>
                                                                <th className="h-7 px-2 font-medium">
                                                                    Status
                                                                </th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {o.items.map(
                                                                (it) => (
                                                                    <tr
                                                                        key={
                                                                            it.productVariantId
                                                                        }
                                                                        className="border-b last:border-0"
                                                                    >
                                                                        <td className="px-2 py-1.5 max-w-[200px] truncate">
                                                                            <div className="font-medium truncate">
                                                                                {
                                                                                    it.productName
                                                                                }
                                                                            </div>
                                                                            {it.skuCode && (
                                                                                <div className="text-[10px] text-muted-foreground font-mono">
                                                                                    {
                                                                                        it.skuCode
                                                                                    }
                                                                                </div>
                                                                            )}
                                                                        </td>
                                                                        <td className="px-2 py-1.5 text-right tabular-nums">
                                                                            {
                                                                                it.quantity
                                                                            }
                                                                        </td>
                                                                        <td className="px-2 py-1.5 text-right tabular-nums">
                                                                            {formatRupiah(
                                                                                it.revenue,
                                                                            )}
                                                                        </td>
                                                                        <td className="px-2 py-1.5 text-right tabular-nums">
                                                                            {it.hppPerUnit !=
                                                                            null ? (
                                                                                formatRupiah(
                                                                                    it.hppPerUnit,
                                                                                )
                                                                            ) : (
                                                                                <span className="text-muted-foreground">
                                                                                    —
                                                                                </span>
                                                                            )}
                                                                        </td>
                                                                        <td className="px-2 py-1.5 text-right tabular-nums">
                                                                            {it.cost !=
                                                                            null ? (
                                                                                formatRupiah(
                                                                                    it.cost,
                                                                                )
                                                                            ) : (
                                                                                <span className="text-muted-foreground">
                                                                                    —
                                                                                </span>
                                                                            )}
                                                                        </td>
                                                                        <td className="px-2 py-1.5 text-right">
                                                                            {it.margin !=
                                                                            null ? (
                                                                                <MarginCell
                                                                                    value={
                                                                                        it.margin
                                                                                    }
                                                                                />
                                                                            ) : (
                                                                                <span className="text-muted-foreground">
                                                                                    —
                                                                                </span>
                                                                            )}
                                                                        </td>
                                                                        <td className="px-2 py-1.5">
                                                                            {it.hppMissing ? (
                                                                                <Badge
                                                                                    variant="outline"
                                                                                    className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800/50 text-[10px]"
                                                                                >
                                                                                    HPP
                                                                                    tidak
                                                                                    tersedia
                                                                                </Badge>
                                                                            ) : (
                                                                                <span className="text-[10px] text-muted-foreground">
                                                                                    OK
                                                                                </span>
                                                                            )}
                                                                        </td>
                                                                    </tr>
                                                                ),
                                                            )}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            <p className="text-[11px] text-muted-foreground">
                Sumber HPP: rata-rata tertimbang per varian dari production
                order COMPLETED/IN_PROGRESS (updatedAt dalam periode). SO tanpa
                HPP ditandai eksplisit — tidak dihitung sebagai cost 0 atau
                margin 0/100%. Pesan &quot;HPP tidak lengkap&quot; berarti
                sebagian item SO tidak punya produksi di periode itu; &quot;HPP
                tidak tersedia&quot; berarti seluruh item.
            </p>
        </div>
    );
}
