'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getFOHAllocation, getExpenseAccounts } from '@/actions/finance/foh-actions';
import { formatRupiah } from '@/lib/utils/utils';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Account {
    id: string;
    code: string;
    name: string;
}

interface AllocationResult {
    totalOverhead: number;
    totalQuantity: number;
    allocations: Array<{
        orderNumber: string;
        actualQuantity: number;
        allocationRatio: number;
        allocatedOverhead: number;
    }>;
}

export default function FOHAllocationPage() {
    const [data, setData] = useState<AllocationResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [month, setMonth] = useState(new Date().getMonth() + 1);
    const [year, setYear] = useState(new Date().getFullYear());
    
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [selectedAccount, setSelectedAccount] = useState<string>('');

    useEffect(() => {
        getExpenseAccounts().then(res => {
            if (res.success && res.data) {
                const accountsData = res.data as Account[];
                setAccounts(accountsData);
                if (accountsData.length > 0) {
                    setSelectedAccount(accountsData[0].id);
                }
            }
        });
    }, []);

    useEffect(() => {
        if (!selectedAccount) return;
        
        let isMounted = true;
        const fetchAllocation = async () => {
            setLoading(true);
            const res = await getFOHAllocation(year, month, selectedAccount);
            if (isMounted) {
                if (res.success) setData(res.data as AllocationResult);
                setLoading(false);
            }
        };
        
        fetchAllocation();
        
        return () => { isMounted = false; };
    }, [year, month, selectedAccount]);

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-10">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Factory Overhead Allocation</h1>
                    <p className="text-muted-foreground">Distribute FOH costs to production orders based on quantity</p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Configuration</CardTitle>
                </CardHeader>
                <CardContent className="flex gap-4 items-end">
                    <div className="space-y-2 flex-1">
                        <label className="text-sm font-medium">Overhead Account</label>
                        <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select Account" />
                            </SelectTrigger>
                            <SelectContent>
                                {accounts.map(acc => (
                                    <SelectItem key={acc.id} value={acc.id}>
                                        {acc.code} - {acc.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2 w-32">
                        <label className="text-sm font-medium">Month</label>
                        <Input type="number" value={month} onChange={e => setMonth(parseInt(e.target.value))} min="1" max="12" />
                    </div>
                    <div className="space-y-2 w-32">
                        <label className="text-sm font-medium">Year</label>
                        <Input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Allocation Results</CardTitle>
                    <CardDescription>
                        Total Overhead: <strong>{data ? formatRupiah(data.totalOverhead) : 0}</strong> | 
                        Total Units Produced: <strong>{data ? data.totalQuantity.toLocaleString() : 0}</strong>
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="py-8 text-center text-muted-foreground">Calculating allocation...</div>
                    ) : !data || data.allocations.length === 0 ? (
                        <div className="py-8 text-center text-muted-foreground">No completed production orders found for this period.</div>
                    ) : (
                        <div className="relative w-full overflow-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-muted/20 text-muted-foreground">
                                        <th className="h-10 px-4 text-left font-medium">Production Order</th>
                                        <th className="h-10 px-4 text-right font-medium">Actual Qty</th>
                                        <th className="h-10 px-4 text-right font-medium">% Ratio</th>
                                        <th className="h-10 px-4 text-right font-medium">Allocated Overhead</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.allocations.map((row, i: number) => (
                                        <tr key={i} className="border-b transition-colors hover:bg-muted/50">
                                            <td className="p-4 align-middle font-medium font-mono">{row.orderNumber}</td>
                                            <td className="p-4 align-middle font-mono text-right">{row.actualQuantity.toLocaleString()}</td>
                                            <td className="p-4 align-middle font-mono text-right">{(row.allocationRatio * 100).toFixed(2)}%</td>
                                            <td className="p-4 align-middle font-mono text-right font-bold text-foreground">
                                                {formatRupiah(row.allocatedOverhead)}
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
