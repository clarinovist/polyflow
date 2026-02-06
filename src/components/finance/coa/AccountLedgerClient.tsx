'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Download, Calendar as CalendarIcon } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

interface LedgerEntry {
    id: string;
    date: Date;
    entryNumber: string;
    description: string;
    reference: string | null;
    referenceType: string | null;
    debit: number;
    credit: number;
    balance: number;
}

interface Account {
    id: string;
    code: string;
    name: string;
    type: string;
    category: string;
    parent: { code: string; name: string } | null;
}

interface LedgerData {
    account: Account;
    entries: LedgerEntry[];
    summary: {
        totalDebit: number;
        totalCredit: number;
        endingBalance: number;
    };
}

interface AccountLedgerClientProps {
    ledgerData: LedgerData;
}

export function AccountLedgerClient({ ledgerData }: AccountLedgerClientProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { account, entries, summary } = ledgerData;
    const [isExporting, setIsExporting] = useState(false);

    // Default to current month if no search params
    const now = new Date();
    const defaultStartDate = startOfMonth(now);
    const defaultEndDate = endOfMonth(now);

    const [startDate, setStartDate] = useState<Date | undefined>(
        searchParams.get('startDate')
            ? new Date(searchParams.get('startDate')!)
            : defaultStartDate
    );
    const [endDate, setEndDate] = useState<Date | undefined>(
        searchParams.get('endDate')
            ? new Date(searchParams.get('endDate')!)
            : defaultEndDate
    );

    const applyDateFilter = () => {
        const params = new URLSearchParams();
        if (startDate) {
            params.set('startDate', format(startDate, 'yyyy-MM-dd'));
        }
        if (endDate) {
            params.set('endDate', format(endDate, 'yyyy-MM-dd'));
        }
        router.push(`/finance/coa/${account.id}?${params.toString()}`);
    };

    const clearDateFilter = () => {
        setStartDate(undefined);
        setEndDate(undefined);
        router.push(`/finance/coa/${account.id}`);
    };

    const handleExport = () => {
        setIsExporting(true);

        // Create CSV content
        const headers = ['Date', 'Entry #', 'Description', 'Reference', 'Debit', 'Credit', 'Balance'];
        const rows = entries.map(entry => [
            format(new Date(entry.date), 'yyyy-MM-dd'),
            entry.entryNumber,
            entry.description,
            entry.reference || '',
            entry.debit.toFixed(2),
            entry.credit.toFixed(2),
            entry.balance.toFixed(2)
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        // Download
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ledger_${account.code}_${format(new Date(), 'yyyyMMdd')}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);

        setIsExporting(false);
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.push('/finance/coa')}
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Account Ledger</h1>
                        <p className="text-muted-foreground">
                            {account.code} - {account.name}
                        </p>
                    </div>
                </div>
                <Button onClick={handleExport} disabled={isExporting}>
                    <Download className="mr-2 h-4 w-4" />
                    {isExporting ? 'Exporting...' : 'Export CSV'}
                </Button>
            </div>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">Filter by Date Range</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">From:</span>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        className={cn(
                                            "w-[200px] justify-start text-left font-normal",
                                            !startDate && "text-muted-foreground"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {startDate ? format(startDate, 'dd MMM yyyy') : 'Pick a date'}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                        mode="single"
                                        selected={startDate}
                                        onSelect={setStartDate}
                                        initialFocus
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>

                        <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">To:</span>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        className={cn(
                                            "w-[200px] justify-start text-left font-normal",
                                            !endDate && "text-muted-foreground"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {endDate ? format(endDate, 'dd MMM yyyy') : 'Pick a date'}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                        mode="single"
                                        selected={endDate}
                                        onSelect={setEndDate}
                                        initialFocus
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>

                        <Button onClick={applyDateFilter} disabled={!startDate && !endDate}>
                            Apply Filter
                        </Button>

                        {(startDate || endDate) && (
                            <Button variant="outline" onClick={clearDateFilter}>
                                Clear
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Total Debit</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(summary.totalDebit)}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Total Credit</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(summary.totalCredit)}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Ending Balance</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(summary.endingBalance)}</div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Transaction History</CardTitle>
                    <CardDescription>
                        All journal entries for this account ({entries.length} transactions)
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Entry #</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead>Reference</TableHead>
                                    <TableHead className="text-right">Debit</TableHead>
                                    <TableHead className="text-right">Credit</TableHead>
                                    <TableHead className="text-right">Balance</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {entries.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center text-muted-foreground">
                                            No transactions found
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    entries.map((entry) => (
                                        <TableRow key={entry.id}>
                                            <TableCell className="whitespace-nowrap">
                                                {format(new Date(entry.date), 'dd MMM yyyy')}
                                            </TableCell>
                                            <TableCell className="font-mono text-sm">
                                                {entry.entryNumber}
                                            </TableCell>
                                            <TableCell>{entry.description}</TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {entry.reference || '-'}
                                            </TableCell>
                                            <TableCell className="text-right font-mono">
                                                {entry.debit > 0 ? formatCurrency(entry.debit) : '-'}
                                            </TableCell>
                                            <TableCell className="text-right font-mono">
                                                {entry.credit > 0 ? formatCurrency(entry.credit) : '-'}
                                            </TableCell>
                                            <TableCell className="text-right font-mono font-semibold">
                                                {formatCurrency(entry.balance)}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
