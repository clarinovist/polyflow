'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { formatRupiah } from '@/lib/utils/utils';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { BarChart3, Users, Package, TrendingUp, MapPin } from 'lucide-react';

type Summary = {
    totalRevenue: number;
    totalOrders: number;
    totalCustomers: number;
    avgOrderValue: number;
    topCustomers: { name: string; revenue: number; orders: number }[];
    topProducts: { name: string; revenue: number; quantity: number }[];
    bySalesperson: {
        userId: string;
        name: string;
        revenue: number;
        orders: number;
        avgOrderValue: number;
        portfolioSize: number;
        visitCount: number;
        // Added in Gap 6 — additive, nullable when no target set
        revenueTarget: number | null;
        achievementPercent: number | null;
        visitTarget: number | null;
        visitAchievementPercent: number | null;
    }[];
    productMixByRegion: {
        region: string;
        productName: string;
        quantity: number;
        revenue: number;
    }[];
};

type Row = {
    period: string;
    orderId: string;
    orderNumber: string;
    orderDate: Date | string;
    customerName: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    totalAmount: number;
    status: string;
    invoiceStatus: string | null;
    salesPerson: string;
};

type Initial = { rows: Row[]; summary: Summary } | null;

type SalesSortKey = 'revenue' | 'achievementPercent';

function AchievementCell({ pct }: { pct: number | null }) {
    if (pct == null) return <span className="text-muted-foreground">–</span>;
    const cappedWidth = Math.min(Math.max(pct, 0), 100);
    const color =
        pct >= 100 ? 'bg-green-500' : pct >= 80 ? 'bg-amber-500' : 'bg-red-400';
    return (
        <div className="flex flex-col gap-1 min-w-[90px]">
            <span className="text-xs font-medium tabular-nums">
                {pct.toFixed(1)}%
            </span>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                    className={`h-full rounded-full ${color} transition-all`}
                    style={{ width: `${cappedWidth}%` }}
                />
            </div>
        </div>
    );
}

export function SalesPerformanceReportClient({
    initialData,
    periodLabel,
}: {
    initialData: Initial;
    periodLabel: string;
    start: Date;
    end: Date;
}) {
    const summary = initialData?.summary ?? null;
    const rows = initialData?.rows ?? [];
    const [activeTab, setActiveTab] = useState<
        'summary' | 'customers' | 'products' | 'salesperson' | 'region' | 'detail'
    >('summary');
    const [salesSort, setSalesSort] = useState<SalesSortKey>('revenue');

    const sortedBySalesperson = useMemo(() => {
        if (!summary) return [];
        const arr = [...summary.bySalesperson];
        if (salesSort === 'achievementPercent') {
            arr.sort((a, b) => {
                const ap = a.achievementPercent ?? -1;
                const bp = b.achievementPercent ?? -1;
                if (ap !== bp) return bp - ap;
                return b.revenue - a.revenue;
            });
        } else {
            arr.sort((a, b) => b.revenue - a.revenue);
        }
        return arr;
    }, [summary, salesSort]);

    const tabs = [
        { key: 'summary' as const, label: 'Ringkasan', icon: TrendingUp },
        { key: 'customers' as const, label: 'Top Customer', icon: Users },
        { key: 'products' as const, label: 'Top Produk', icon: Package },
        {
            key: 'salesperson' as const,
            label: 'Performa per Sales',
            icon: Users,
        },
        {
            key: 'region' as const,
            label: 'Product Mix per Wilayah',
            icon: MapPin,
        },
        { key: 'detail' as const, label: 'Detail Order', icon: BarChart3 },
    ];

    return (
        <div className="space-y-6">
            {summary == null ? (
                <div className="text-center py-12 text-muted-foreground">
                    <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>Tidak ada data untuk periode {periodLabel}.</p>
                </div>
            ) : (
                <>
                    <p className="text-xs text-muted-foreground">
                        Scope: {periodLabel} • orderDate non-batal • Basis:
                        nilai Sales Order
                    </p>
                    <Tabs
                        value={activeTab}
                        onValueChange={(v) =>
                            setActiveTab(
                                v as
                                    | 'summary'
                                    | 'customers'
                                    | 'products'
                                    | 'salesperson'
                                    | 'region'
                                    | 'detail',
                            )
                        }
                    >
                        <TabsList className="flex flex-wrap h-auto">
                            {tabs.map((tab) => {
                                const Icon = tab.icon;
                                return (
                                    <TabsTrigger
                                        key={tab.key}
                                        value={tab.key}
                                    >
                                        <Icon className="h-3.5 w-3.5 mr-1.5" />
                                        {tab.label}
                                    </TabsTrigger>
                                );
                            })}
                        </TabsList>

                    {/* Summary Tab */}
                    <TabsContent value="summary" className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">
                                        Total Omzet
                                    </CardTitle>
                                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold">
                                        {formatRupiah(summary.totalRevenue)}
                                    </div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">
                                        Total Order
                                    </CardTitle>
                                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold">
                                        {summary.totalOrders}
                                    </div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">
                                        Total Customer
                                    </CardTitle>
                                    <Users className="h-4 w-4 text-muted-foreground" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold">
                                        {summary.totalCustomers}
                                    </div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">
                                        Rata-rata per Order
                                    </CardTitle>
                                    <Package className="h-4 w-4 text-muted-foreground" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold">
                                        {formatRupiah(summary.avgOrderValue)}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>

                    {/* Top Customers Tab */}
                    <TabsContent value="customers">
                        <Card>
                            <CardHeader>
                                <CardTitle>Top 10 Customer by Omzet</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[40px]">
                                                #
                                            </TableHead>
                                            <TableHead>Customer</TableHead>
                                            <TableHead className="text-center">
                                                Order
                                            </TableHead>
                                            <TableHead className="text-right">
                                                Omzet
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {summary.topCustomers.map((c, i) => (
                                            <TableRow key={c.name}>
                                                <TableCell className="text-muted-foreground">
                                                    {i + 1}
                                                </TableCell>
                                                <TableCell className="font-medium">
                                                    {c.name}
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    {c.orders}
                                                </TableCell>
                                                <TableCell className="text-right font-semibold">
                                                    {formatRupiah(c.revenue)}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Top Products Tab */}
                    <TabsContent value="products">
                        <Card>
                            <CardHeader>
                                <CardTitle>Top 10 Produk by Omzet</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[40px]">
                                                #
                                            </TableHead>
                                            <TableHead>Produk</TableHead>
                                            <TableHead className="text-center">
                                                Qty
                                            </TableHead>
                                            <TableHead className="text-right">
                                                Omzet
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {summary.topProducts.map((p, i) => (
                                            <TableRow key={p.name}>
                                                <TableCell className="text-muted-foreground">
                                                    {i + 1}
                                                </TableCell>
                                                <TableCell className="font-medium">
                                                    {p.name}
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    {p.quantity}
                                                </TableCell>
                                                <TableCell className="text-right font-semibold">
                                                    {formatRupiah(p.revenue)}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Sales Performance Tab */}
                    <TabsContent value="salesperson" className="space-y-4">
                            {/* Summary metric cards */}
                            {summary.bySalesperson.length > 0 && (
                                <div className="grid gap-4 md:grid-cols-3">
                                    <Card>
                                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                            <CardTitle className="text-sm font-medium">
                                                Total Omzet Bulan Ini
                                            </CardTitle>
                                            <TrendingUp className="h-4 w-4 text-muted-foreground" />
                                        </CardHeader>
                                        <CardContent>
                                            <div className="text-2xl font-bold">
                                                {formatRupiah(
                                                    summary.totalRevenue,
                                                )}
                                            </div>
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                            <CardTitle className="text-sm font-medium">
                                                Top Performer
                                            </CardTitle>
                                            <Users className="h-4 w-4 text-muted-foreground" />
                                        </CardHeader>
                                        <CardContent>
                                            <div className="text-2xl font-bold">
                                                {summary.bySalesperson[0]
                                                    ?.name || '-'}
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                {formatRupiah(
                                                    summary.bySalesperson[0]
                                                        ?.revenue || 0,
                                                )}
                                            </p>
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                            <CardTitle className="text-sm font-medium">
                                                Rata-rata Omzet per Sales
                                            </CardTitle>
                                            <Package className="h-4 w-4 text-muted-foreground" />
                                        </CardHeader>
                                        <CardContent>
                                            <div className="text-2xl font-bold">
                                                {formatRupiah(
                                                    summary.bySalesperson
                                                        .length > 0
                                                        ? summary.totalRevenue /
                                                              summary
                                                                  .bySalesperson
                                                                  .length
                                                        : 0,
                                                )}
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>
                            )}

                            <Card>
                                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <CardTitle>
                                            Ranking Performa Sales
                                        </CardTitle>
                                        <p className="text-[11px] text-muted-foreground mt-1">
                                            Basis: nilai Sales Order — berbeda
                                            dengan basis jurnal akuntansi (4xx)
                                            di dashboard
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <label className="text-xs text-muted-foreground">
                                            Urut:
                                        </label>
                                        <select
                                            value={salesSort}
                                            onChange={(e) =>
                                                setSalesSort(
                                                    e.target
                                                        .value as SalesSortKey,
                                                )
                                            }
                                            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                                        >
                                            <option value="revenue">
                                                Omzet
                                            </option>
                                            <option value="achievementPercent">
                                                % Pencapaian
                                            </option>
                                        </select>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    {sortedBySalesperson.length === 0 ? (
                                        <p className="text-sm text-muted-foreground text-center py-6">
                                            Belum ada data performa sales.
                                        </p>
                                    ) : (
                                        <div className="overflow-auto">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead className="w-[40px]">
                                                            #
                                                        </TableHead>
                                                        <TableHead>
                                                            Nama
                                                        </TableHead>
                                                        <TableHead className="text-right">
                                                            Omzet
                                                        </TableHead>
                                                        <TableHead className="text-right">
                                                            Target
                                                        </TableHead>
                                                        <TableHead className="text-left min-w-[110px]">
                                                            Pencapaian
                                                        </TableHead>
                                                        <TableHead className="text-center">
                                                            Jumlah Order
                                                        </TableHead>
                                                        <TableHead className="text-right">
                                                            Avg Order Value
                                                        </TableHead>
                                                        <TableHead className="text-center">
                                                            Kunjungan / Target
                                                        </TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {sortedBySalesperson.map(
                                                        (sp, i) => (
                                                            <TableRow
                                                                key={sp.userId}
                                                            >
                                                                <TableCell className="text-muted-foreground">
                                                                    {i + 1}
                                                                </TableCell>
                                                                <TableCell className="font-medium">
                                                                    {sp.name}
                                                                </TableCell>
                                                                <TableCell className="text-right font-semibold">
                                                                    {formatRupiah(
                                                                        sp.revenue,
                                                                    )}
                                                                </TableCell>
                                                                <TableCell className="text-right">
                                                                    {sp.revenueTarget !=
                                                                    null ? (
                                                                        formatRupiah(
                                                                            sp.revenueTarget,
                                                                        )
                                                                    ) : (
                                                                        <span className="text-muted-foreground">
                                                                            –
                                                                        </span>
                                                                    )}
                                                                </TableCell>
                                                                <TableCell>
                                                                    <AchievementCell
                                                                        pct={
                                                                            sp.achievementPercent
                                                                        }
                                                                    />
                                                                </TableCell>
                                                                <TableCell className="text-center">
                                                                    {sp.orders}
                                                                </TableCell>
                                                                <TableCell className="text-right">
                                                                    {formatRupiah(
                                                                        sp.avgOrderValue,
                                                                    )}
                                                                </TableCell>
                                                                <TableCell className="text-center text-sm">
                                                                    {
                                                                        sp.visitCount
                                                                    }
                                                                    {sp.visitTarget !=
                                                                    null
                                                                        ? ` / ${sp.visitTarget}`
                                                                        : ''}
                                                                    {sp.visitAchievementPercent !=
                                                                    null ? (
                                                                        <span className="ml-1 text-xs text-muted-foreground">
                                                                            (
                                                                            {
                                                                                sp.visitAchievementPercent
                                                                            }
                                                                            %)
                                                                        </span>
                                                                    ) : null}
                                                                </TableCell>
                                                            </TableRow>
                                                        ),
                                                    )}
                                                </TableBody>
                                                </Table>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                    </TabsContent>

                    {/* Product Mix per Wilayah Tab */}
                    <TabsContent value="region">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-sm">
                                    Product Mix per Wilayah
                                </CardTitle>
                                <p className="text-[11px] text-muted-foreground mt-1">
                                    Dikelompokkan berdasarkan kota (fallback ke
                                    provinsi jika kota kosong)
                                </p>
                            </CardHeader>
                            <CardContent>
                                <div className="rounded-lg border overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>
                                                    Wilayah
                                                </TableHead>
                                                <TableHead>
                                                    Produk
                                                </TableHead>
                                                <TableHead className="text-right">
                                                    Qty
                                                </TableHead>
                                                <TableHead className="text-right">
                                                    Omzet
                                                </TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {summary.productMixByRegion.length === 0 ? (
                                                <TableRow>
                                                    <TableCell
                                                        colSpan={4}
                                                        className="text-center text-muted-foreground py-8"
                                                    >
                                                        Tidak ada data product
                                                        mix per wilayah.
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                summary.productMixByRegion.map(
                                                    (row, i) => (
                                                        <TableRow
                                                            key={`${row.region}-${row.productName}-${i}`}
                                                        >
                                                            <TableCell className="font-medium">
                                                                {row.region}
                                                            </TableCell>
                                                            <TableCell>
                                                                {
                                                                    row.productName
                                                                }
                                                            </TableCell>
                                                            <TableCell className="text-right tabular-nums">
                                                                {row.quantity}
                                                            </TableCell>
                                                            <TableCell className="text-right font-semibold">
                                                                {formatRupiah(
                                                                    row.revenue,
                                                                )}
                                                            </TableCell>
                                                        </TableRow>
                                                    ),
                                                )
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Detail Tab */}
                    <TabsContent value="detail">
                        <Card>
                            <CardHeader>
                                <CardTitle>
                                    Detail Order ({rows.length} baris)
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="max-h-[600px] overflow-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Tanggal</TableHead>
                                                <TableHead>SO</TableHead>
                                                <TableHead>Customer</TableHead>
                                                <TableHead>Produk</TableHead>
                                                <TableHead className="text-right">
                                                    Qty
                                                </TableHead>
                                                <TableHead className="text-right">
                                                    Subtotal
                                                </TableHead>
                                                <TableHead>Sales</TableHead>
                                                <TableHead>Status</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {rows.map((row, i) => (
                                                <TableRow
                                                    key={`${row.orderId}-${i}`}
                                                >
                                                    <TableCell className="text-xs whitespace-nowrap">
                                                        {format(
                                                            new Date(
                                                                row.orderDate,
                                                            ),
                                                            'dd MMM',
                                                            {
                                                                locale: idLocale,
                                                            },
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="font-mono text-xs">
                                                        {row.orderNumber}
                                                    </TableCell>
                                                    <TableCell className="text-sm">
                                                        {row.customerName}
                                                    </TableCell>
                                                    <TableCell className="text-sm">
                                                        {row.productName}
                                                    </TableCell>
                                                    <TableCell className="text-right text-sm">
                                                        {row.quantity}
                                                    </TableCell>
                                                    <TableCell className="text-right text-sm font-semibold">
                                                        {formatRupiah(
                                                            row.subtotal,
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-xs">
                                                        {row.salesPerson}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge
                                                            variant="outline"
                                                            className="text-[10px]"
                                                        >
                                                            {row.status}
                                                        </Badge>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                    </Tabs>
                </>
            )}
        </div>
    );
}
