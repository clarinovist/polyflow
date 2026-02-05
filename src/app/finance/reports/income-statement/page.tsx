'use client';

import { useState, useEffect } from 'react';
import { getIncomeStatement } from '@/actions/accounting';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupiah } from '@/lib/utils';
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { Button } from '@/components/ui/button';
import { DateRange } from 'react-day-picker';
import { RotateCw, Download } from 'lucide-react';
import { useCallback } from 'react';

interface IncomeStatementItem {
    id: string;
    code: string;
    name: string;
    netBalance: number;
}

interface IncomeStatementData {
    revenue: IncomeStatementItem[];
    expense: IncomeStatementItem[];
    totalRevenue: number;
    totalExpense: number;
    netIncome: number;
}

export default function IncomeStatementPage() {
    const [data, setData] = useState<IncomeStatementData | null>(null);
    const [loading, setLoading] = useState(true);
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: new Date(new Date().getFullYear(), 0, 1),
        to: new Date()
    });

    const fetchData = useCallback(async () => {
        if (!dateRange?.from || !dateRange?.to) return;

        setLoading(true);
        try {
            const report = await getIncomeStatement(dateRange.from, dateRange.to);
            setData(report as unknown as IncomeStatementData);
        } catch (error) {
            console.error("Failed to load income statement", error);
        } finally {
            setLoading(false);
        }
    }, [dateRange]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Income Statement</h1>
                    <p className="text-muted-foreground">
                        Profit and Loss statement for the selected period.
                    </p>
                </div>
                <div className="flex gap-2">
                    <DatePickerWithRange
                        date={dateRange}
                        onDateChange={setDateRange}
                    />
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
                    <CardTitle>Statement of Financial Performance</CardTitle>
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
                                        <TableRow className="bg-muted/50 font-bold">
                                            <TableCell colSpan={3}>REVENUE</TableCell>
                                        </TableRow>
                                        {data.revenue.map((item) => (
                                            <TableRow key={item.id}>
                                                <TableCell className="pl-8">{item.name}</TableCell>
                                                <TableCell className="font-mono text-xs">{item.code}</TableCell>
                                                <TableCell className="text-right">{formatRupiah(item.netBalance)}</TableCell>
                                            </TableRow>
                                        ))}
                                        <TableRow className="font-bold border-t-2">
                                            <TableCell colSpan={2}>TOTAL REVENUE</TableCell>
                                            <TableCell className="text-right">{formatRupiah(data.totalRevenue)}</TableCell>
                                        </TableRow>

                                        <TableRow className="bg-muted/50 font-bold mt-4">
                                            <TableCell colSpan={3}>EXPENSES</TableCell>
                                        </TableRow>
                                        {data.expense.map((item) => (
                                            <TableRow key={item.id}>
                                                <TableCell className="pl-8">{item.name}</TableCell>
                                                <TableCell className="font-mono text-xs">{item.code}</TableCell>
                                                <TableCell className="text-right">{formatRupiah(item.netBalance)}</TableCell>
                                            </TableRow>
                                        ))}
                                        <TableRow className="font-bold border-t-2">
                                            <TableCell colSpan={2}>TOTAL EXPENSES</TableCell>
                                            <TableCell className="text-right">{formatRupiah(data.totalExpense)}</TableCell>
                                        </TableRow>

                                        <TableRow className="bg-primary/10 font-bold text-lg border-t-4 border-primary">
                                            <TableCell colSpan={2}>NET INCOME</TableCell>
                                            <TableCell className={`text-right ${data.netIncome >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {formatRupiah(data.netIncome)}
                                            </TableCell>
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
