'use client';

import { useState, useEffect, useCallback } from 'react';
import { getIncomeStatement } from '@/actions/accounting';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupiah } from '@/lib/utils';
import { startOfMonth, endOfMonth, addMonths, subMonths, format } from 'date-fns';
import { id } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, RotateCw, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';


interface IncomeStatementItem {
    id: string;
    code: string;
    name: string;
    netBalance: number;
}

interface IncomeStatementData {
    revenue: IncomeStatementItem[];
    cogs: IncomeStatementItem[];
    opex: IncomeStatementItem[];
    other: IncomeStatementItem[];
    totalRevenue: number;
    totalManufacturingCosts: number;
    inventoryChange: number;
    totalCOGS: number; // Adjusted
    grossProfit: number;
    totalOpEx: number;
    operatingIncome: number;
    totalOther: number;
    netIncome: number;
}

export default function IncomeStatementPage() {
    const [data, setData] = useState<IncomeStatementData | null>(null);
    const [loading, setLoading] = useState(true);
    const [date, setDate] = useState<Date>(new Date());
    const [hideZero, setHideZero] = useState(true);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const startDate = startOfMonth(date);
            const endDate = endOfMonth(date);

            const report = await getIncomeStatement(startDate, endDate);
            setData(report as unknown as IncomeStatementData);
        } catch (error) {
            console.error("Failed to load income statement", error);
        } finally {
            setLoading(false);
        }
    }, [date]);

    const handlePrevMonth = () => setDate(prev => subMonths(prev, 1));
    const handleNextMonth = () => setDate(prev => addMonths(prev, 1));
    const handleCurrentMonth = () => setDate(new Date());

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Helper to group COGS items
    const getGroupedCOGS = (items: IncomeStatementItem[]) => {
        const materials = items.filter(i => i.code.startsWith('51')).reduce((sum, i) => sum + i.netBalance, 0);
        const labor = items.filter(i => i.code.startsWith('52')).reduce((sum, i) => sum + i.netBalance, 0);
        const overhead = items.filter(i => i.code.startsWith('53')).reduce((sum, i) => sum + i.netBalance, 0);
        return { materials, labor, overhead };
    };

    const groupedCOGS = data ? getGroupedCOGS(data.cogs) : { materials: 0, labor: 0, overhead: 0 };

    // Helper to group OpEx items
    const getGroupedOpEx = (items: IncomeStatementItem[]) => {
        const selling = items.filter(i => i.code.startsWith('61')).reduce((sum, i) => sum + i.netBalance, 0);
        const general = items.filter(i => i.code.startsWith('62')).reduce((sum, i) => sum + i.netBalance, 0);
        return { selling, general };
    };

    const groupedOpEx = data ? getGroupedOpEx(data.opex) : { selling: 0, general: 0 };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Laporan Laba Rugi</h1>
                    <p className="text-muted-foreground">
                        Analisis profitabilitas bertahap untuk periode yang dipilih.
                    </p>
                </div>
                <div className="flex gap-2 items-center">
                    <div className="flex items-center border rounded-md bg-background">
                        <Button variant="ghost" size="icon" onClick={handlePrevMonth}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <div className="w-40 text-center font-medium">
                            {format(date, "MMMM yyyy", { locale: id })}
                        </div>
                        <Button variant="ghost" size="icon" onClick={handleNextMonth}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                    <Button variant="outline" onClick={handleCurrentMonth}>
                        Bulan Ini
                    </Button>
                    <Button variant="outline" size="icon" onClick={fetchData}>
                        <RotateCw className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon">
                        <Download className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <div className="flex items-center space-x-2 bg-muted/20 p-3 rounded-lg border w-fit">
                <Switch
                    id="hide-zero"
                    checked={hideZero}
                    onCheckedChange={setHideZero}
                />
                <Label htmlFor="hide-zero" className="cursor-pointer font-medium">
                    Hide Zero Balances
                </Label>
            </div>

            {/* Summary Cards - like COA Ledger */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Total Pendapatan</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{data ? formatRupiah(data.totalRevenue) : '-'}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Laba Kotor</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{data ? formatRupiah(data.grossProfit) : '-'}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Laba Operasional</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{data ? formatRupiah(data.operatingIncome) : '-'}</div>
                    </CardContent>
                </Card>
                <Card className="bg-muted/50">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Laba Bersih</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-primary">{data ? formatRupiah(data.netIncome) : '-'}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Main Report Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Statement of Profit or Loss</CardTitle>
                    <CardDescription>Multi-step manufacturing income statement</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[50%]">Keterangan Akun</TableHead>
                                    <TableHead className="w-[15%]">Kode</TableHead>
                                    <TableHead className="text-right w-[35%]">Jumlah (IDR)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={3} className="h-48 text-center">
                                            <div className="flex flex-col items-center justify-center space-y-2">
                                                <RotateCw className="h-8 w-8 animate-spin text-muted-foreground" />
                                                <span className="text-sm text-muted-foreground">Memuat data...</span>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : !data ? (
                                    <TableRow>
                                        <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                                            Tidak ada data untuk periode ini
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    <>
                                        {/* 1. REVENUE SECTION */}
                                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                                            <TableCell colSpan={3} className="font-semibold">
                                                I. PENDAPATAN (REVENUE)
                                            </TableCell>
                                        </TableRow>
                                        {data.revenue
                                            .filter(item => !hideZero || Math.abs(item.netBalance) > 0.01)
                                            .map((item) => (
                                                <TableRow key={item.id}>
                                                    <TableCell className="pl-8">{item.name}</TableCell>
                                                    <TableCell className="font-mono text-sm text-muted-foreground">{item.code}</TableCell>
                                                    <TableCell className="text-right font-mono">{formatRupiah(item.netBalance)}</TableCell>
                                                </TableRow>
                                            ))}
                                        <TableRow className="font-semibold border-t">
                                            <TableCell colSpan={2}>Total Pendapatan</TableCell>
                                            <TableCell className="text-right font-mono">{formatRupiah(data.totalRevenue)}</TableCell>
                                        </TableRow>

                                        {/* 2. COGS SECTION (Simplified) */}
                                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                                            <TableCell colSpan={3} className="font-semibold">
                                                II. HARGA POKOK PENJUALAN (COGS)
                                            </TableCell>
                                        </TableRow>

                                        {/* Simplified Categories */}
                                        <TableRow>
                                            <TableCell className="pl-8">Direct Materials Used</TableCell>
                                            <TableCell className="font-mono text-sm text-muted-foreground">51000</TableCell>
                                            <TableCell className="text-right font-mono">{formatRupiah(groupedCOGS.materials)}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell className="pl-8">Direct Labor</TableCell>
                                            <TableCell className="font-mono text-sm text-muted-foreground">52000</TableCell>
                                            <TableCell className="text-right font-mono">{formatRupiah(groupedCOGS.labor)}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell className="pl-8">Factory Overhead</TableCell>
                                            <TableCell className="font-mono text-sm text-muted-foreground">53000</TableCell>
                                            <TableCell className="text-right font-mono">{formatRupiah(groupedCOGS.overhead)}</TableCell>
                                        </TableRow>

                                        <TableRow className="border-t border-dashed">
                                            <TableCell colSpan={2} className="pl-8 italic text-muted-foreground">Total Biaya Produksi</TableCell>
                                            <TableCell className="text-right font-mono text-muted-foreground">{formatRupiah(data.totalManufacturingCosts)}</TableCell>
                                        </TableRow>

                                        <TableRow className="font-semibold border-t">
                                            <TableCell colSpan={2}>Total HPP</TableCell>
                                            <TableCell className="text-right font-mono">({formatRupiah(data.totalCOGS)})</TableCell>
                                        </TableRow>

                                        {/* Gross Profit */}
                                        <TableRow className="bg-muted/50 font-bold border-y-2">
                                            <TableCell colSpan={2}>LABA KOTOR (GROSS PROFIT)</TableCell>
                                            <TableCell className="text-right font-mono text-lg">{formatRupiah(data.grossProfit)}</TableCell>
                                        </TableRow>

                                        {/* 3. OPERATING EXPENSES SECTION (Simplified) */}
                                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                                            <TableCell colSpan={3} className="font-semibold">
                                                III. BEBAN OPERASIONAL
                                            </TableCell>
                                        </TableRow>

                                        <TableRow>
                                            <TableCell className="pl-8">Selling & Marketing Expenses</TableCell>
                                            <TableCell className="font-mono text-sm text-muted-foreground">61000</TableCell>
                                            <TableCell className="text-right font-mono">({formatRupiah(groupedOpEx.selling)})</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell className="pl-8">General & Administrative Expenses</TableCell>
                                            <TableCell className="font-mono text-sm text-muted-foreground">62000</TableCell>
                                            <TableCell className="text-right font-mono">({formatRupiah(groupedOpEx.general)})</TableCell>
                                        </TableRow>

                                        <TableRow className="font-semibold border-t">
                                            <TableCell colSpan={2}>Total Beban Operasional</TableCell>
                                            <TableCell className="text-right font-mono">({formatRupiah(data.totalOpEx)})</TableCell>
                                        </TableRow>

                                        {/* Operating Income */}
                                        <TableRow className="bg-muted/50 font-bold border-y-2">
                                            <TableCell colSpan={2}>LABA OPERASIONAL (EBIT)</TableCell>
                                            <TableCell className="text-right font-mono text-lg">{formatRupiah(data.operatingIncome)}</TableCell>
                                        </TableRow>

                                        {/* 4. OTHER INCOME/EXPENSES */}
                                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                                            <TableCell colSpan={3} className="font-semibold">
                                                IV. PENDAPATAN/BEBAN LAINNYA
                                            </TableCell>
                                        </TableRow>
                                        {data.other
                                            .filter(item => !hideZero || Math.abs(item.netBalance) > 0.01)
                                            .map((item) => (
                                                <TableRow key={item.id}>
                                                    <TableCell className="pl-8">{item.name}</TableCell>
                                                    <TableCell className="font-mono text-sm text-muted-foreground">{item.code}</TableCell>
                                                    <TableCell className="text-right font-mono">
                                                        {formatRupiah(Math.abs(item.netBalance))}
                                                        {item.netBalance < 0 ? ' (Beban)' : ''}
                                                    </TableCell>
                                                </TableRow>
                                            ))}

                                        {/* Net Income */}
                                        <TableRow className="bg-primary/10 hover:bg-primary/10 font-bold border-t-2">
                                            <TableCell colSpan={2} className="text-lg">LABA BERSIH (NET INCOME)</TableCell>
                                            <TableCell className="text-right font-mono text-xl text-primary">{formatRupiah(data.netIncome)}</TableCell>
                                        </TableRow>
                                    </>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* Margin Analysis Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Gross Margin</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {data && data.totalRevenue > 0 ? ((data.grossProfit / data.totalRevenue) * 100).toFixed(1) : '0'}%
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Efisiensi produksi</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Operating Margin</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {data && data.totalRevenue > 0 ? ((data.operatingIncome / data.totalRevenue) * 100).toFixed(1) : '0'}%
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Efisiensi operasional</p>
                    </CardContent>
                </Card>
                <Card className="bg-muted/50">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Net Profit Margin</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-primary">
                            {data && data.totalRevenue > 0 ? ((data.netIncome / data.totalRevenue) * 100).toFixed(1) : '0'}%
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Profitabilitas akhir</p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
