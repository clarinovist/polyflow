'use client';

import React from 'react';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/table';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    ResponsiveContainer
} from 'recharts';
import { format } from 'date-fns';
import { TrendingUp, TrendingDown, Info, Package, History, LayoutDashboard } from 'lucide-react';
import { Product, ProductVariant, Inventory, Prisma } from '@prisma/client';

// Define CostHistory manually since it might not be exported from client yet
interface CostHistory {
    id: string;
    productVariantId: string;
    previousCost: Prisma.Decimal | null;
    newCost: Prisma.Decimal;
    changeReason: string;
    referenceId: string | null;
    changePercent: Prisma.Decimal | null;
    createdById: string | null;
    createdAt: Date;
}

// Define extended types to match the data fetch structure
interface ExtendedCostHistory extends CostHistory {
    createdBy: { name: string | null } | null;
}

interface ExtendedInventory extends Inventory {
    location: { name: string } | null;
}

interface ExtendedVariant extends ProductVariant {
    costHistory: ExtendedCostHistory[];
    inventories: ExtendedInventory[];
    stock?: number; // Calculated field
}

interface ProductWithDetails extends Product {
    variants: ExtendedVariant[];
}

interface FlattenedHistory extends ExtendedCostHistory {
    variantName: string;
}

// Helper for currency
const formatIDR = (value: number | string | null | undefined) => {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
    }).format(Number(value));
};

export function ProductDetail({ product }: { product: ProductWithDetails }) {
    const mainVariant = product.variants[0]; // Primary variant for chart etc.

    // Prepare data for Recharts
    const chartData = [...(mainVariant?.costHistory || [])]
        .reverse()
        .map((h) => ({
            date: format(new Date(h.createdAt), 'MMM dd'),
            cost: Number(h.newCost)
        }));

    const latestHistory = mainVariant?.costHistory?.[0];
    const changePercent = latestHistory?.changePercent ? Number(latestHistory.changePercent) : 0;
    const isCostUp = changePercent > 0;
    const isSignificantChange = Math.abs(changePercent) > 10;

    const flattenedHistory: FlattenedHistory[] = product.variants.flatMap((v) =>
        (v.costHistory || []).map((h) => ({ ...h, variantName: v.name } as FlattenedHistory))
    ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return (
        <Tabs defaultValue="overview" className="space-y-4">
            <TabsList>
                <TabsTrigger value="overview">
                    <LayoutDashboard className="mr-2 h-4 w-4" /> Overview
                </TabsTrigger>
                <TabsTrigger value="history">
                    <History className="mr-2 h-4 w-4" /> Cost History
                </TabsTrigger>
                <TabsTrigger value="stock">
                    <Package className="mr-2 h-4 w-4" /> Stock & Locations
                </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Standard Cost</CardTitle>
                            <Info className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold" suppressHydrationWarning>{formatIDR(Number(mainVariant?.standardCost))}</div>
                            {latestHistory && (
                                <p className={`text-xs flex items-center mt-1 ${isCostUp ? 'text-red-500' : 'text-green-500'}`}>
                                    {isCostUp ? <TrendingUp className="mr-1 h-3 w-3" /> : <TrendingDown className="mr-1 h-3 w-3" />}
                                    {Math.abs(changePercent)}% from last change
                                </p>
                            )}
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Product Type</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{product.productType.replace('_', ' ')}</div>
                            <p className="text-xs text-muted-foreground">{product.variants.length} Variant(s)</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Total Stock</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {product.variants.reduce((sum: number, v) => sum + (v.stock || 0), 0)}
                            </div>
                            <p className="text-xs text-muted-foreground">Across all locations</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Sell Price</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold" suppressHydrationWarning>{formatIDR(Number(mainVariant?.price))}</div>
                        </CardContent>
                    </Card>
                </div>

                {isSignificantChange && (
                    <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-semibold flex items-center text-red-600">
                                <Info className="mr-2 h-4 w-4" /> Price Alert
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-red-600">
                                The standard cost for <strong>{mainVariant.name}</strong> has changed by <strong>{changePercent}%</strong> on {format(new Date(latestHistory.createdAt), 'PPP')}.
                                Please review your profit margins.
                            </p>
                        </CardContent>
                    </Card>
                )}

                <Card className="col-span-4">
                    <CardHeader>
                        <CardTitle>Cost Trend</CardTitle>
                        <CardDescription>Price movements over the last 10 changes for primary variant</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px] pl-2">
                        {chartData.length > 1 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis
                                        dataKey="date"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <YAxis
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={(value) => `Rp${value.toLocaleString()}`}
                                    />
                                    <RechartsTooltip
                                        formatter={(value: number | undefined) => [formatIDR(value), 'Cost']}
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="cost"
                                        stroke="#2563eb"
                                        strokeWidth={2}
                                        dot={{ r: 4, fill: '#2563eb' }}
                                        activeDot={{ r: 6 }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex h-full items-center justify-center text-muted-foreground">
                                Not enough history data to display chart
                            </div>
                        )}
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="history" className="space-y-4">
                <Card>
                    <CardHeader>
                        <CardTitle>Cost Change Logs</CardTitle>
                        <CardDescription>Detailed history of standard cost updates for all variants</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Variant</TableHead>
                                    <TableHead>Old Cost</TableHead>
                                    <TableHead>New Cost</TableHead>
                                    <TableHead>Change %</TableHead>
                                    <TableHead>Reason</TableHead>
                                    <TableHead>Updated By</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {flattenedHistory.length > 0 ? (
                                    flattenedHistory.map((h) => (
                                        <TableRow key={h.id}>
                                            <TableCell className="font-medium">
                                                {format(new Date(h.createdAt), 'MMM dd, yyyy HH:mm')}
                                            </TableCell>
                                            <TableCell>{h.variantName}</TableCell>
                                            <TableCell className="text-muted-foreground" suppressHydrationWarning>
                                                {formatIDR(Number(h.previousCost))}
                                            </TableCell>
                                            <TableCell className="font-semibold" suppressHydrationWarning>
                                                {formatIDR(Number(h.newCost))}
                                            </TableCell>
                                            <TableCell>
                                                {h.changePercent !== null && (
                                                    <Badge variant={Number(h.changePercent) > 0 ? 'destructive' : 'secondary'}>
                                                        {Number(h.changePercent) > 0 ? '+' : ''}{Number(h.changePercent)}%
                                                    </Badge>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline">{h.changeReason.replace('_', ' ')}</Badge>
                                            </TableCell>
                                            <TableCell>{h.createdBy?.name || 'System'}</TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                            No cost history found for this product.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="stock" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                    {product.variants.map((v) => (
                        <Card key={v.id}>
                            <CardHeader>
                                <CardTitle className="text-lg">{v.name}</CardTitle>
                                <CardDescription>SKU: {v.skuCode}</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Location</TableHead>
                                            <TableHead className="text-right">On Hand</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {v.inventories?.length > 0 ? (
                                            v.inventories.map((inv, idx) => (
                                                <TableRow key={idx}>
                                                    <TableCell>{inv.location?.name || 'Unknown'}</TableCell>
                                                    <TableCell className="text-right font-medium">
                                                        {Number(inv.quantity)} {v.primaryUnit}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={2} className="text-center text-muted-foreground py-4">
                                                    Out of stock
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </TabsContent>
        </Tabs>
    );
}
