'use client';

import { useState, useEffect, useCallback } from 'react';
import { getBudgetVariance } from '@/actions/accounting';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupiah } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { RotateCw, Download, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface VarianceItem {
    accountCode: string;
    accountName: string;
    budget: number;
    actual: number;
    variance: number;
    variancePercent: number;
}

export default function BudgetVariancePage() {
    const [data, setData] = useState<VarianceItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [year, setYear] = useState(new Date().getFullYear().toString());
    const [month, setMonth] = useState((new Date().getMonth() + 1).toString());

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const report = await getBudgetVariance(parseInt(year), parseInt(month));
            setData(report as unknown as VarianceItem[]);
        } catch (error) {
            console.error("Failed to load variance report", error);
        } finally {
            setLoading(false);
        }
    }, [year, month]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const months = [
        { val: "1", label: "January" }, { val: "2", label: "February" }, { val: "3", label: "March" },
        { val: "4", label: "April" }, { val: "5", label: "May" }, { val: "6", label: "June" },
        { val: "7", label: "July" }, { val: "8", label: "August" }, { val: "9", label: "September" },
        { val: "10", label: "October" }, { val: "11", label: "November" }, { val: "12", label: "December" }
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Budget Variance</h1>
                    <p className="text-muted-foreground">
                        Compare actual performance against your plan for {months.find(m => m.val === month)?.label} {year}.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Select value={year} onValueChange={setYear}>
                        <SelectTrigger className="w-[100px]">
                            <SelectValue placeholder="Year" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="2024">2024</SelectItem>
                            <SelectItem value="2025">2025</SelectItem>
                            <SelectItem value="2026">2026</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={month} onValueChange={setMonth}>
                        <SelectTrigger className="w-[140px]">
                            <SelectValue placeholder="Month" />
                        </SelectTrigger>
                        <SelectContent>
                            {months.map(m => (
                                <SelectItem key={m.val} value={m.val}>{m.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
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
                    <CardTitle>Variance Analysis</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Account</TableHead>
                                    <TableHead className="text-right">Budget</TableHead>
                                    <TableHead className="text-right">Actual</TableHead>
                                    <TableHead className="text-right">Variance</TableHead>
                                    <TableHead className="text-right">%</TableHead>
                                    <TableHead className="w-[100px]">Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center">Loading...</TableCell>
                                    </TableRow>
                                ) : data.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center">No budget found for this period.</TableCell>
                                    </TableRow>
                                ) : (
                                    data.map((item) => {
                                        const isOver = item.variance > 0;
                                        const isUnder = item.variance < 0;
                                        // For Expenses: Over is Bad (Red), Under is Good (Green)
                                        // For Revenue: Over is Good (Green), Under is Bad (Red)
                                        // Simple logic: if variance is positive, show up icon.

                                        return (
                                            <TableRow key={item.accountCode}>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="font-medium">{item.accountName}</span>
                                                        <span className="text-xs text-muted-foreground font-mono">{item.accountCode}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">{formatRupiah(item.budget)}</TableCell>
                                                <TableCell className="text-right">{formatRupiah(item.actual)}</TableCell>
                                                <TableCell className={`text-right font-bold ${isOver ? 'text-blue-600' : isUnder ? 'text-amber-600' : ''}`}>
                                                    {formatRupiah(item.variance)}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {item.variancePercent.toFixed(1)}%
                                                </TableCell>
                                                <TableCell>
                                                    {isOver ? (
                                                        <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">
                                                            <ArrowUpRight className="h-3 w-3 mr-1" /> Over
                                                        </Badge>
                                                    ) : isUnder ? (
                                                        <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">
                                                            <ArrowDownRight className="h-3 w-3 mr-1" /> Under
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="text-slate-500">
                                                            <Minus className="h-3 w-3 mr-1" /> Flat
                                                        </Badge>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
