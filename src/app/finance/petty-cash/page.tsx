'use client';

import { useState, useEffect, useCallback } from 'react';
import { getPettyCashTransactions, getPettyCashBalance, approvePettyCashExpense } from '@/actions/finance/petty-cash-actions';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatRupiah } from '@/lib/utils/utils';
import { Wallet, Plus, RefreshCw, CheckCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Transaction {
    id: string;
    voucherNumber: string;
    date: Date;
    description: string;
    amount: number;
    type: string;
    status: string;
    expenseAccount?: { name: string, code: string };
    createdBy: { name: string };
}

export default function PettyCashPage() {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [balance, setBalance] = useState<number>(0);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [trxRes, balRes] = await Promise.all([
                getPettyCashTransactions(),
                getPettyCashBalance()
            ]);
            
            if (trxRes.success) setTransactions(trxRes.data as unknown as Transaction[]);
            if (balRes.success) setBalance(balRes.data as number);
        } catch (error) {
            console.error("Failed to fetch petty cash data", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleApprove = async (id: string) => {
        try {
            const res = await approvePettyCashExpense(id);
            if (res.success) {
                fetchData();
            }
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-10">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Petty Cash</h1>
                    <p className="text-muted-foreground">Manage small daily expenses</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={fetchData} size="icon">
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                    <Button variant="outline" className="gap-2 text-emerald-600 border-emerald-200 hover:bg-emerald-50">
                        <Wallet className="h-4 w-4" />
                        Replenish Fund
                    </Button>
                    <Button className="gap-2">
                        <Plus className="h-4 w-4" />
                        New Expense
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Wallet className="h-5 w-5 opacity-80" />
                            Current Balance
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-4xl font-bold font-mono">
                            {formatRupiah(balance)}
                        </div>
                        <p className="text-indigo-100 text-sm mt-2 opacity-80">
                            Available imprest fund
                        </p>
                    </CardContent>
                </Card>
                
                <Card>
                    <CardHeader>
                        <CardTitle className="text-muted-foreground text-sm uppercase">Quick Stats</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-medium">Pending Vouchers</span>
                            <span className="font-mono bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-xs">
                                {transactions.filter(t => t.status === 'DRAFT').length}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-medium">Draft Liability</span>
                            <span className="font-mono text-sm text-muted-foreground">
                                {formatRupiah(transactions.filter(t => t.status === 'DRAFT').reduce((acc, curr) => acc + (typeof curr.amount === 'number' ? curr.amount : parseFloat(curr.amount as string)), 0))}
                            </span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Transaction History</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="py-8 text-center text-muted-foreground text-sm flex justify-center items-center gap-2">
                            <RefreshCw className="h-4 w-4 animate-spin" /> Loading transactions...
                        </div>
                    ) : transactions.length === 0 ? (
                        <div className="py-8 text-center text-muted-foreground text-sm">
                            No petty cash transactions found.
                        </div>
                    ) : (
                        <div className="relative w-full overflow-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b transition-colors border-border/50 bg-muted/20 text-muted-foreground">
                                        <th className="h-10 px-4 text-left font-medium">Date</th>
                                        <th className="h-10 px-4 text-left font-medium">Voucher No</th>
                                        <th className="h-10 px-4 text-left font-medium">Type</th>
                                        <th className="h-10 px-4 text-left font-medium">Description</th>
                                        <th className="h-10 px-4 text-right font-medium">Amount</th>
                                        <th className="h-10 px-4 text-left font-medium">Status</th>
                                        <th className="h-10 px-4 text-right font-medium">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {transactions.map(t => (
                                        <tr key={t.id} className="border-b transition-colors hover:bg-muted/50 border-border/50">
                                            <td className="p-4 align-middle">{new Date(t.date).toLocaleDateString()}</td>
                                            <td className="p-4 align-middle font-mono text-xs">{t.voucherNumber}</td>
                                            <td className="p-4 align-middle">
                                                <span className={`px-2 py-1 rounded-full text-[10px] uppercase font-semibold ${t.type === 'EXPENSE' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                    {t.type}
                                                </span>
                                            </td>
                                            <td className="p-4 align-middle">
                                                <div className="font-medium">{t.description}</div>
                                                {t.expenseAccount && (
                                                    <div className="text-xs text-muted-foreground mt-0.5">
                                                        {t.expenseAccount.code} - {t.expenseAccount.name}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="p-4 align-middle text-right font-mono font-medium">
                                                {t.type === 'EXPENSE' ? '-' : '+'}{formatRupiah(typeof t.amount === 'number' ? t.amount : parseFloat(t.amount as string))}
                                            </td>
                                            <td className="p-4 align-middle">
                                                <div className="flex items-center gap-1.5">
                                                    {t.status === 'DRAFT' && <Clock className="h-3.5 w-3.5 text-amber-500" />}
                                                    {t.status === 'POSTED' && <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />}
                                                    <span className="text-xs">{t.status}</span>
                                                </div>
                                            </td>
                                            <td className="p-4 align-middle text-right">
                                                {t.status === 'DRAFT' && (
                                                    <Button variant="outline" size="sm" onClick={() => handleApprove(t.id)}>
                                                        Approve
                                                    </Button>
                                                )}
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
