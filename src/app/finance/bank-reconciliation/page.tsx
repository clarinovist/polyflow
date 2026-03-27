'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UploadCloud, CheckCircle, AlertCircle, RefreshCw } from "lucide-react";
import { autoMatchReconciliation } from '@/actions/finance/reconciliation-actions';
import { getChartOfAccounts } from '@/actions/finance/accounting';
import { formatRupiah } from '@/lib/utils/utils';

interface BankStatementRow {
    id: string; 
    date: Date;
    description: string;
    amount: number; 
}

interface MatchResult {
    statementRow: BankStatementRow;
    matchedJournalLineId?: string;
    confidence: number;
    candidates: Record<string, unknown>[];
}

interface BankAccount {
    id: string;
    code: string;
    name: string;
    isCashAccount?: boolean;
    category?: string;
}

export default function BankReconciliationPage() {
    const [accounts, setAccounts] = useState<BankAccount[]>([]);
    const [selectedAccount, setSelectedAccount] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [results, setResults] = useState<MatchResult[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        getChartOfAccounts().then((res: Record<string, unknown>) => {
            if (res.success) {
                // Filter cash/bank accounts
                const accData = res.data as BankAccount[];
                setAccounts(accData.filter(a => a.isCashAccount || a.category === 'CASH'));
            }
        });
    }, []);

    const handleSimulateUpload = async () => {
        if (!selectedAccount || !startDate || !endDate) return alert("Select account and dates first.");
        
        // Generate some dummy bank statements for the selected dates based on common transactions
        const dummyStatements: BankStatementRow[] = [
            { id: 'S1', date: new Date(startDate), description: 'Customer Payment INV-001', amount: 5000000 },
            { id: 'S2', date: new Date(startDate), description: 'Vendor Payment PO-021', amount: -2500000 },
            { id: 'S3', date: new Date(endDate), description: 'Bank Admin Fee', amount: -50000 },
            { id: 'S4', date: new Date(endDate), description: 'Interest Income', amount: 120000 }
        ];

        setLoading(true);
        try {
            const res = await autoMatchReconciliation(
                selectedAccount, 
                new Date(startDate), 
                new Date(endDate), 
                dummyStatements
            );
            if (res.success) {
                setResults(res.data as unknown as MatchResult[]);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-10">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Bank Reconciliation</h1>
                <p className="text-muted-foreground">Match bank statements against general ledger</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Reconciliation Parameters</CardTitle>
                    <CardDescription>Select period and bank account to reconcile</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label>Bank Account</Label>
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
                        <div className="space-y-2">
                            <Label>Start Date</Label>
                            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>End Date</Label>
                            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                        </div>
                    </div>
                    
                    <div className="pt-4 flex justify-end">
                        <Button onClick={handleSimulateUpload} disabled={loading} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
                            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                            Upload statement & Auto Match
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {results.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Reconciliation Results</CardTitle>
                        <CardDescription>Review the auto-matched results and confirm</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b transition-colors bg-muted/20 text-muted-foreground">
                                    <th className="h-10 px-4 text-left font-medium">Bank Date</th>
                                    <th className="h-10 px-4 text-left font-medium">Description</th>
                                    <th className="h-10 px-4 text-right font-medium">Amount</th>
                                    <th className="h-10 px-4 text-left font-medium">Match Status</th>
                                    <th className="h-10 px-4 text-left font-medium">GL Line Matched</th>
                                </tr>
                            </thead>
                            <tbody>
                                {results.map((r, i) => (
                                    <tr key={i} className="border-b transition-colors hover:bg-muted/50">
                                        <td className="p-4 align-middle whitespace-nowrap">
                                            {new Date(r.statementRow.date).toLocaleDateString()}
                                        </td>
                                        <td className="p-4 align-middle">{r.statementRow.description}</td>
                                        <td className="p-4 align-middle text-right font-mono font-medium">
                                            {formatRupiah(typeof r.statementRow.amount === 'number' ? r.statementRow.amount : parseFloat(r.statementRow.amount))}
                                        </td>
                                        <td className="p-4 align-middle">
                                            {r.confidence === 100 ? (
                                                <div className="flex items-center gap-1.5 text-emerald-600 font-medium bg-emerald-50 px-2 py-1 rounded inline-flex">
                                                    <CheckCircle className="h-3.5 w-3.5" /> Auto-Matched
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1.5 text-amber-600 font-medium bg-amber-50 px-2 py-1 rounded inline-flex">
                                                    <AlertCircle className="h-3.5 w-3.5" /> Unreconciled
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-4 align-middle text-xs">
                                            {r.confidence === 100 ? (
                                                <span className="text-muted-foreground">
                                                    Line ID: {r.matchedJournalLineId?.slice(0, 8)}...
                                                </span>
                                            ) : (
                                                <Button variant="outline" size="sm">Find Match</Button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="mt-6 flex justify-end">
                            <Button>Confirm Reconciliation</Button>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
