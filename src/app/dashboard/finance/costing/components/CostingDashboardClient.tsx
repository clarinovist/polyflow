'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { Badge } from '@/components/ui/badge';
import { getProductionCostReport, getWipValuation } from '@/actions/finance';
import { formatRupiah } from '@/lib/utils';
import { format } from 'date-fns';
import { Loader2, TrendingUp, DollarSign, Package } from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell
} from 'recharts';
import { DateRange } from 'react-day-picker';

interface CostingDashboardClientProps {
    initialDateRange?: { from: Date; to: Date };
}

export function CostingDashboardClient({ initialDateRange }: CostingDashboardClientProps) {
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        to: new Date()
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [costData, setCostData] = useState<any[]>([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [wipData, setWipData] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function fetchData() {
            setIsLoading(true);
            try {
                // Formatting dates for server action
                const from = dateRange?.from ? dateRange.from : undefined;
                const to = dateRange?.to ? dateRange.to : undefined;

                const [costs, wip] = await Promise.all([
                    getProductionCostReport(from, to),
                    getWipValuation()
                ]);
                setCostData(costs);
                setWipData(wip);
            } catch (error) {
                console.error("Failed to fetch costing data", error);
            } finally {
                setIsLoading(false);
            }
        }
        fetchData();
    }, [dateRange]);

    // KPI Calculations
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const totalProductionCost = costData.reduce((sum: number, item: any) => sum + item.totalCost, 0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const avgUnitCost = costData.length > 0 ? totalProductionCost / costData.reduce((sum: number, item: any) => sum + item.quantity, 0) : 0;
    const materialRatio = costData.length > 0
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? (costData.reduce((sum: number, item: any) => sum + item.materialCost, 0) / totalProductionCost) * 100
        : 0;

    // Chart Data Preparation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chartData = costData.slice(0, 10).map((item: any) => ({
        name: item.orderNumber,
        Material: item.materialCost,
        Conversion: item.conversionCost
    }));

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Cost Accounting</h1>
                    <p className="text-muted-foreground">Analysis of Manufacturing Costs and WIP</p>
                </div>
                <div className="flex items-center gap-2">
                    <DatePickerWithRange date={dateRange} onDateChange={setDateRange} />
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total COGM (Selected Period)</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatRupiah(totalProductionCost)}</div>
                        <p className="text-xs text-muted-foreground">{costData.length} Completed Orders</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Current WIP Value</CardTitle>
                        <Package className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {wipData ? (
                            <>
                                <div className="text-2xl font-bold text-blue-600">{formatRupiah(wipData.totalWipValue)}</div>
                                <p className="text-xs text-muted-foreground">{wipData.orderCount} Active Orders</p>
                            </>
                        ) : (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Material vs Conversion</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{materialRatio.toFixed(1)}% / {(100 - materialRatio).toFixed(1)}%</div>
                        <p className="text-xs text-muted-foreground">Material / Conversion Split</p>
                    </CardContent>
                </Card>
            </div>

            <Tabs defaultValue="cogm" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="cogm">Finished Goods Costing</TabsTrigger>
                    <TabsTrigger value="wip">WIP Analysis</TabsTrigger>
                </TabsList>

                <TabsContent value="cogm" className="space-y-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Cost Composition (Last 10 Orders)</CardTitle>
                            </CardHeader>
                            <CardContent className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={chartData}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="name" fontSize={10} />
                                        <YAxis fontSize={10} tickFormatter={(value) => `${value / 1000}k`} />
                                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                        <Tooltip formatter={(value: any) => formatRupiah(Number(value || 0))} />
                                        <Legend />
                                        <Bar dataKey="Material" stackId="a" fill="#3b82f6" />
                                        <Bar dataKey="Conversion" stackId="a" fill="#f59e0b" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle>Cost Detail Breakdown</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="rounded-md border">
                                    <table className="w-full text-sm">
                                        <thead className="bg-muted/50">
                                            <tr>
                                                <th className="p-2 text-left">PO #</th>
                                                <th className="p-2 text-left">Product</th>
                                                <th className="p-2 text-right">Qty</th>
                                                <th className="p-2 text-right">Unit Cost</th>
                                                <th className="p-2 text-right">Total Cost</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                            {costData.map((item: any) => (
                                                <tr key={item.id}>
                                                    <td className="p-2 font-medium">{item.orderNumber}</td>
                                                    <td className="p-2">
                                                        <div>{item.productName}</div>
                                                        <div className="text-[10px] text-muted-foreground">{item.skuCode}</div>
                                                    </td>
                                                    <td className="p-2 text-right">{item.quantity}</td>
                                                    <td className="p-2 text-right text-emerald-600 font-medium">{formatRupiah(item.unitCost)}</td>
                                                    <td className="p-2 text-right">{formatRupiah(item.totalCost)}</td>
                                                </tr>
                                            ))}
                                            {costData.length === 0 && (
                                                <tr>
                                                    <td colSpan={5} className="p-4 text-center text-muted-foreground">No data found within range</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="wip">
                    <Card>
                        <CardHeader>
                            <CardTitle>Active Work In Progress</CardTitle>
                            <CardDescription>Value of raw materials consumed in currently active orders</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-md border">
                                <table className="w-full text-sm">
                                    <thead className="bg-muted/50">
                                        <tr>
                                            <th className="p-2 text-left">PO #</th>
                                            <th className="p-2 text-left">Product</th>
                                            <th className="p-2 text-left">Start Date</th>
                                            <th className="p-2 text-right">Running Material Cost</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                        {wipData?.orders.map((item: any) => (
                                            <tr key={item.id}>
                                                <td className="p-2 font-medium">{item.orderNumber}</td>
                                                <td className="p-2">{item.productName}</td>
                                                <td className="p-2">{item.startDate ? format(new Date(item.startDate), 'PP') : '-'}</td>
                                                <td className="p-2 text-right font-medium text-blue-600">{formatRupiah(item.currentMaterialCost)}</td>
                                            </tr>
                                        ))}
                                        {(!wipData?.orders || wipData.orders.length === 0) && (
                                            <tr>
                                                <td colSpan={4} className="p-4 text-center text-muted-foreground">No active WIP found</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
