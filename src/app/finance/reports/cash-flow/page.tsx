'use client';

import { useState, useEffect, useCallback } from 'react';
import { getCashFlowStatement } from '@/actions/finance/accounting';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupiah } from '@/lib/utils/utils';
import { startOfMonth, endOfMonth, addMonths, subMonths, format } from 'date-fns';
import { id } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, RotateCw, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CashFlowItem {
    name: string;
    amount: number;
}

interface CashFlowData {
    operatingActivities: CashFlowItem[];
    investingActivities: CashFlowItem[];
    financingActivities: CashFlowItem[];
    netOperating: number;
    netInvesting: number;
    netFinancing: number;
    netCashFlow: number;
    beginningBalance: number;
    endingBalance: number;
}

export default function CashFlowStatementPage() {
    const [data, setData] = useState<CashFlowData | null>(null);
    const [loading, setLoading] = useState(true);
    const [date, setDate] = useState<Date>(new Date());

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const startDate = startOfMonth(date);
            const endDate = endOfMonth(date);

            const report = await getCashFlowStatement(startDate, endDate);
            if (report.success) {
                setData(report.data as unknown as CashFlowData);
            }
        } catch (error) {
            console.error("Failed to load cash flow statement", error);
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

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Laporan Arus Kas</h1>
                    <p className="text-muted-foreground">
                        Analisis pergerakan kas masuk dan keluar untuk periode yang dipilih.
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
                        <RotateCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                    <Button variant="outline" size="icon">
                        <Download className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Arus Kas Operasional</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${data && data.netOperating < 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                            {data ? formatRupiah(data.netOperating) : '-'}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Arus Kas Investasi</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{data ? formatRupiah(data.netInvesting) : '-'}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Arus Kas Pendanaan</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{data ? formatRupiah(data.netFinancing) : '-'}</div>
                    </CardContent>
                </Card>
                <Card className="bg-primary/5 border-primary/20">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Saldo Kas Akhir</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-primary">{data ? formatRupiah(data.endingBalance) : '-'}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Main Report Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Cash Flow Statement</CardTitle>
                    <CardDescription>Statement of cash flows using the direct/indirect approach based on general ledger entries.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[60%]">Keterangan</TableHead>
                                    <TableHead className="text-right w-[40%]">Jumlah (IDR)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={2} className="h-48 text-center">
                                            <div className="flex flex-col items-center justify-center space-y-2">
                                                <RotateCw className="h-8 w-8 animate-spin text-muted-foreground" />
                                                <span className="text-sm text-muted-foreground">Memuat data...</span>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : !data ? (
                                    <TableRow>
                                        <TableCell colSpan={2} className="h-24 text-center text-muted-foreground">
                                            Tidak ada data untuk periode ini
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    <>
                                        {/* Beginning Balance */}
                                        <TableRow className="bg-muted/10 font-medium">
                                            <TableCell>Saldo Kas Awal (Beginning Balance)</TableCell>
                                            <TableCell className="text-right font-mono">{formatRupiah(data.beginningBalance)}</TableCell>
                                        </TableRow>

                                        {/* 1. OPERATING ACTIVITIES */}
                                        <TableRow className="bg-muted/30 hover:bg-muted/30 mt-4">
                                            <TableCell colSpan={2} className="font-semibold text-primary">
                                                I. ARUS KAS DARI AKTIVITAS OPERASIONAL
                                            </TableCell>
                                        </TableRow>
                                        {data.operatingActivities.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={2} className="text-center text-muted-foreground italic text-sm py-4">
                                                    Tidak ada arus kas operasional
                                                </TableCell>
                                            </TableRow>
                                        ) : data.operatingActivities.map((item, i) => (
                                            <TableRow key={`op-${i}`}>
                                                <TableCell className="pl-8">{item.name}</TableCell>
                                                <TableCell className="text-right font-mono">
                                                    {item.amount < 0 ? `(${formatRupiah(Math.abs(item.amount))})` : formatRupiah(item.amount)}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        <TableRow className="font-semibold border-t">
                                            <TableCell className="pl-8 text-muted-foreground">Kas Bersih dari Aktivitas Operasional</TableCell>
                                            <TableCell className="text-right font-mono text-emerald-600">{formatRupiah(data.netOperating)}</TableCell>
                                        </TableRow>

                                        {/* 2. INVESTING ACTIVITIES */}
                                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                                            <TableCell colSpan={2} className="font-semibold text-primary">
                                                II. ARUS KAS DARI AKTIVITAS INVESTASI
                                            </TableCell>
                                        </TableRow>
                                        {data.investingActivities.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={2} className="text-center text-muted-foreground italic text-sm py-4">
                                                    Tidak ada arus kas investasi
                                                </TableCell>
                                            </TableRow>
                                        ) : data.investingActivities.map((item, i) => (
                                            <TableRow key={`inv-${i}`}>
                                                <TableCell className="pl-8">{item.name}</TableCell>
                                                <TableCell className="text-right font-mono">
                                                    {item.amount < 0 ? `(${formatRupiah(Math.abs(item.amount))})` : formatRupiah(item.amount)}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        <TableRow className="font-semibold border-t">
                                            <TableCell className="pl-8 text-muted-foreground">Kas Bersih dari Aktivitas Investasi</TableCell>
                                            <TableCell className="text-right font-mono">{formatRupiah(data.netInvesting)}</TableCell>
                                        </TableRow>

                                        {/* 3. FINANCING ACTIVITIES */}
                                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                                            <TableCell colSpan={2} className="font-semibold text-primary">
                                                III. ARUS KAS DARI AKTIVITAS PENDANAAN
                                            </TableCell>
                                        </TableRow>
                                        {data.financingActivities.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={2} className="text-center text-muted-foreground italic text-sm py-4">
                                                    Tidak ada arus kas pendanaan
                                                </TableCell>
                                            </TableRow>
                                        ) : data.financingActivities.map((item, i) => (
                                            <TableRow key={`fin-${i}`}>
                                                <TableCell className="pl-8">{item.name}</TableCell>
                                                <TableCell className="text-right font-mono">
                                                    {item.amount < 0 ? `(${formatRupiah(Math.abs(item.amount))})` : formatRupiah(item.amount)}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        <TableRow className="font-semibold border-t">
                                            <TableCell className="pl-8 text-muted-foreground">Kas Bersih dari Aktivitas Pendanaan</TableCell>
                                            <TableCell className="text-right font-mono">{formatRupiah(data.netFinancing)}</TableCell>
                                        </TableRow>

                                        {/* NET INCREASE/DECREASE */}
                                        <TableRow className="font-bold border-y-2 bg-muted/10">
                                            <TableCell>Kenaikan / (Penurunan) Kas Bersih</TableCell>
                                            <TableCell className="text-right font-mono text-lg">{formatRupiah(data.netCashFlow)}</TableCell>
                                        </TableRow>

                                        {/* ENDING BALANCE */}
                                        <TableRow className="bg-primary/10 font-bold border-b-2">
                                            <TableCell className="text-lg">SALDO KAS AKHIR (Ending Balance)</TableCell>
                                            <TableCell className="text-right font-mono text-xl text-primary">{formatRupiah(data.endingBalance)}</TableCell>
                                        </TableRow>
                                    </>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
