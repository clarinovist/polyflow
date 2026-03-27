'use client';

import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getBudgetVsActuals } from '@/actions/finance/budgeting-actions';
import { formatRupiah } from '@/lib/utils/utils';
import { ArrowUpIcon, ArrowDownIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface BudgetRow {
    id: string;
    accountCode: string;
    accountName: string;
    category: string;
    budgetAmount: number;
    actualAmount: number;
    variance: number;
    variancePercentage: number;
}

export default function BudgetingPage() {
    const [data, setData] = useState<BudgetRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [month, setMonth] = useState(new Date().getMonth() + 1);
    const [year, setYear] = useState(new Date().getFullYear());

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getBudgetVsActuals(year, month);
            if (res.success) {
                setData(res.data as BudgetRow[]);
            }
        } finally {
            setLoading(false);
        }
    }, [year, month]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleDateChange = (type: 'year'|'month', val: number) => {
        if (type === 'year') setYear(val);
        else setMonth(val);
    }

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-10">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Budget vs Actuals</h1>
                    <p className="text-muted-foreground">Monitor departmental and company spending</p>
                </div>
                <div className="flex gap-2 items-center">
                    <Input 
                        type="number" 
                        value={year} 
                        onChange={e => handleDateChange('year', parseInt(e.target.value))} 
                        className="w-24"
                    />
                    <Input 
                        type="number" 
                        value={month} 
                        onChange={e => handleDateChange('month', parseInt(e.target.value))} 
                        className="w-20"
                        min="1" max="12"
                    />
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Overview</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="py-8 text-center text-muted-foreground">Loading budget data...</div>
                    ) : data.length === 0 ? (
                        <div className="py-8 text-center text-muted-foreground">No budgets configured for this period.</div>
                    ) : (
                        <div className="relative w-full overflow-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-muted/20 text-muted-foreground">
                                        <th className="h-10 px-4 text-left font-medium">Account</th>
                                        <th className="h-10 px-4 text-right font-medium">Budget</th>
                                        <th className="h-10 px-4 text-right font-medium">Actual</th>
                                        <th className="h-10 px-4 text-right font-medium">Variance</th>
                                        <th className="h-10 px-4 text-right font-medium">% Left</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.map((row, i) => (
                                        <tr key={i} className="border-b transition-colors hover:bg-muted/50">
                                            <td className="p-4 align-middle">
                                                <div className="font-medium">{row.accountName}</div>
                                                <div className="text-xs text-muted-foreground">{row.accountCode}</div>
                                            </td>
                                            <td className="p-4 align-middle text-right font-mono text-muted-foreground">
                                                {formatRupiah(row.budgetAmount)}
                                            </td>
                                            <td className="p-4 align-middle text-right font-mono font-medium">
                                                {formatRupiah(row.actualAmount)}
                                            </td>
                                            <td className="p-4 align-middle text-right font-mono">
                                                <div className={`flex items-center justify-end gap-1 ${row.variance < 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                                    {row.variance < 0 ? <ArrowDownIcon className="h-3 w-3" /> : <ArrowUpIcon className="h-3 w-3" />}
                                                    {formatRupiah(Math.abs(row.variance))}
                                                </div>
                                            </td>
                                            <td className="p-4 align-middle text-right font-mono">
                                                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${row.variancePercentage < 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                    {row.variancePercentage.toFixed(1)}%
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
