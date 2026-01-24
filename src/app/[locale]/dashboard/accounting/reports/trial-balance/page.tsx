'use client';

import { useState, useEffect } from 'react';
import { getTrialBalance } from '@/actions/accounting';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupiah } from '@/lib/utils';
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { Button } from '@/components/ui/button';
import { DateRange } from 'react-day-picker';
import { RotateCw, Download } from 'lucide-react';
import { useCallback } from 'react';

interface TrialBalanceItem {
    id: string;
    code: string;
    name: string;
    debit: number;
    credit: number;
    netBalance: number;
}

export default function TrialBalancePage() {
    const [data, setData] = useState<TrialBalanceItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: new Date(new Date().getFullYear(), 0, 1),
        to: new Date()
    });

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const report = await getTrialBalance(dateRange?.from, dateRange?.to);
            setData(report as unknown as TrialBalanceItem[]);
        } catch (error) {
            console.error("Failed to load trial balance", error);
        } finally {
            setLoading(false);
        }
    }, [dateRange]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const totalDebit = data.reduce((sum, item) => sum + Number(item.debit), 0);
    const totalCredit = data.reduce((sum, item) => sum + Number(item.credit), 0);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Trial Balance</h1>
                    <p className="text-muted-foreground">
                        Account balances for the selected period.
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
                    <CardTitle>Detailed Report</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Account Code</TableHead>
                                    <TableHead>Account Name</TableHead>
                                    <TableHead className="text-right">Debit</TableHead>
                                    <TableHead className="text-right">Credit</TableHead>
                                    <TableHead className="text-right">Net Balance</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-24 text-center">
                                            Loading...
                                        </TableCell>
                                    </TableRow>
                                ) : data.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-24 text-center">
                                            No Data
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    <>
                                        {data.map((item) => (
                                            <TableRow key={item.id}>
                                                <TableCell className="font-mono">{item.code}</TableCell>
                                                <TableCell>{item.name}</TableCell>
                                                <TableCell className="text-right">{item.debit > 0 ? formatRupiah(item.debit) : '-'}</TableCell>
                                                <TableCell className="text-right">{item.credit > 0 ? formatRupiah(item.credit) : '-'}</TableCell>
                                                <TableCell className={`text-right font-medium`}>
                                                    {formatRupiah(item.netBalance)}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        <TableRow className="bg-muted/50 font-bold border-t-2">
                                            <TableCell colSpan={2}>Total</TableCell>
                                            <TableCell className="text-right text-green-600">{formatRupiah(totalDebit)}</TableCell>
                                            <TableCell className="text-right text-green-600">{formatRupiah(totalCredit)}</TableCell>
                                            <TableCell className="text-right">
                                                {formatRupiah(totalDebit - totalCredit)}
                                                {Math.abs(totalDebit - totalCredit) > 0.01 && (
                                                    <span className="ml-2 text-xs text-red-500 bg-red-100 px-1 rounded">UNBALANCED</span>
                                                )}
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
