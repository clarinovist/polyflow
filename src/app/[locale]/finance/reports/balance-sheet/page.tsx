'use client';

import { useState, useEffect } from 'react';
import { getBalanceSheet } from '@/actions/accounting';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupiah } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { RotateCw, Download } from 'lucide-react';
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { CalendarIcon } from "lucide-react"
import { format } from "date-fns"
import { useCallback } from 'react';

interface BalanceSheetItem {
    id: string;
    code: string;
    name: string;
    netBalance: number;
}

interface BalanceSheetData {
    assets: BalanceSheetItem[];
    liabilities: BalanceSheetItem[];
    equity: BalanceSheetItem[];
    totalAssets: number;
    totalLiabilities: number;
    calculatedNetIncome: number;
    totalEquity: number;
    totalLiabilitiesAndEquity: number;
}

export default function BalanceSheetPage() {
    const [data, setData] = useState<BalanceSheetData | null>(null);
    const [loading, setLoading] = useState(true);
    const [date, setDate] = useState<Date>(new Date());

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const report = await getBalanceSheet(date);
            setData(report as unknown as BalanceSheetData);
        } catch (error) {
            console.error("Failed to load balance sheet", error);
        } finally {
            setLoading(false);
        }
    }, [date]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Balance Sheet</h1>
                    <p className="text-muted-foreground">
                        Financial Position as of {format(date, "PPP")}
                    </p>
                </div>
                <div className="flex gap-2">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant={"outline"}
                                className={cn(
                                    "w-[240px] justify-start text-left font-normal",
                                    !date && "text-muted-foreground"
                                )}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {date ? format(date, "PPP") : <span>Pick a date</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end">
                            <Calendar
                                mode="single"
                                selected={date}
                                onSelect={(d) => d && setDate(d)}
                                captionLayout="dropdown"
                                fromYear={2000}
                                toYear={new Date().getFullYear() + 1}
                                initialFocus
                            />
                        </PopoverContent>
                    </Popover>
                    <Button variant="outline" size="icon" onClick={fetchData}>
                        <RotateCw className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon">
                        <Download className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Statement of Financial Position</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Account</TableHead>
                                    <TableHead>Code</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={3} className="h-24 text-center">Loading...</TableCell>
                                    </TableRow>
                                ) : !data ? (
                                    <TableRow>
                                        <TableCell colSpan={3} className="h-24 text-center">No Data</TableCell>
                                    </TableRow>
                                ) : (
                                    <>
                                        {/* ASSETS */}
                                        <TableRow className="bg-muted/50 font-bold">
                                            <TableCell colSpan={3}>ASSETS</TableCell>
                                        </TableRow>
                                        {data.assets.map((item) => (
                                            <TableRow key={item.id}>
                                                <TableCell className="pl-8">{item.name}</TableCell>
                                                <TableCell className="font-mono text-xs">{item.code}</TableCell>
                                                <TableCell className="text-right">{formatRupiah(item.netBalance)}</TableCell>
                                            </TableRow>
                                        ))}
                                        <TableRow className="font-bold border-t-2 bg-slate-50">
                                            <TableCell colSpan={2}>TOTAL ASSETS</TableCell>
                                            <TableCell className="text-right">{formatRupiah(data.totalAssets)}</TableCell>
                                        </TableRow>

                                        {/* LIABILITIES */}
                                        <TableRow className="bg-muted/50 font-bold mt-4">
                                            <TableCell colSpan={3}>LIABILITIES</TableCell>
                                        </TableRow>
                                        {data.liabilities.map((item) => (
                                            <TableRow key={item.id}>
                                                <TableCell className="pl-8">{item.name}</TableCell>
                                                <TableCell className="font-mono text-xs">{item.code}</TableCell>
                                                <TableCell className="text-right">{formatRupiah(item.netBalance)}</TableCell>
                                            </TableRow>
                                        ))}
                                        <TableRow className="font-bold border-t-2">
                                            <TableCell colSpan={2}>TOTAL LIABILITIES</TableCell>
                                            <TableCell className="text-right">{formatRupiah(data.totalLiabilities)}</TableCell>
                                        </TableRow>

                                        {/* EQUITY */}
                                        <TableRow className="bg-muted/50 font-bold mt-4">
                                            <TableCell colSpan={3}>EQUITY</TableCell>
                                        </TableRow>
                                        {data.equity.map((item) => (
                                            <TableRow key={item.id}>
                                                <TableCell className="pl-8">{item.name}</TableCell>
                                                <TableCell className="font-mono text-xs">{item.code}</TableCell>
                                                <TableCell className="text-right">{formatRupiah(item.netBalance)}</TableCell>
                                            </TableRow>
                                        ))}

                                        {/* Calculated Net Income */}
                                        <TableRow>
                                            <TableCell className="pl-8 italic">Current Earnings (Calculated)</TableCell>
                                            <TableCell className="font-mono text-xs">33000</TableCell>
                                            <TableCell className="text-right">{formatRupiah(data.calculatedNetIncome)}</TableCell>
                                        </TableRow>

                                        <TableRow className="font-bold border-t-2">
                                            <TableCell colSpan={2}>TOTAL EQUITY</TableCell>
                                            <TableCell className="text-right">{formatRupiah(data.totalEquity + data.calculatedNetIncome)}</TableCell>
                                        </TableRow>

                                        <TableRow className="bg-primary/10 font-bold text-lg border-t-4 border-primary">
                                            <TableCell colSpan={2}>TOTAL LIABILITIES & EQUITY</TableCell>
                                            <TableCell className="text-right">{formatRupiah(data.totalLiabilitiesAndEquity)}</TableCell>
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
