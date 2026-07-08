'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Download, Search } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { TransactionDateFilter } from '@/components/common/transaction-date-filter';
import { DateRange } from 'react-day-picker';
interface LedgerEntry {
    id: string;
    date: Date | string;
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
        beginningBalance: number;
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
    const [searchTerm, setSearchTerm] = useState('');

    // Default to current month if no search params
    const now = new Date();
    const defaultStartDate = startOfMonth(now);
    const defaultEndDate = endOfMonth(now);

    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : defaultStartDate,
        to: searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : defaultEndDate
    });

    const applyDateFilter = (newRange: DateRange | undefined) => {
        setDateRange(newRange);

        // Immediate update on selection (or we can keep the Apply button, but TransactionDateFilter usually implies immediate effect or we can wrap it)
        // The previous design had an "Apply Filter" button.
        // Let's make it immediate for better UX as per the plan "onRangeChange calls router.push"

        const params = new URLSearchParams();
        if (newRange?.from) {
            params.set('startDate', format(newRange.from, 'yyyy-MM-dd'));
        }
        if (newRange?.to) {
            params.set('endDate', format(newRange.to, 'yyyy-MM-dd'));
        }
        router.push(`/finance/coa/${account.id}?${params.toString()}`);
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

    // Filter entries by search term
    const filteredEntries = searchTerm.trim()
        ? entries.filter((entry) => {
              const lowerSearch = searchTerm.toLowerCase();
              return (
                  entry.description.toLowerCase().includes(lowerSearch) ||
                  entry.entryNumber.toLowerCase().includes(lowerSearch) ||
                  (entry.reference && entry.reference.toLowerCase().includes(lowerSearch))
              );
          })
        : entries;

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

            <Card className="py-3 gap-3 shadow-sm">
                <CardHeader className="px-4 pb-0">
                    <CardTitle className="text-sm font-medium">Filter by Date Range</CardTitle>
                </CardHeader>
                <CardContent className="px-4">
                    <div className="flex items-center gap-4">
                        <TransactionDateFilter
                            date={dateRange}
                            onDateChange={applyDateFilter}
                            defaultPreset="this_month"
                            className="w-[300px]"
                        />
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Cari keterangan, no jurnal, atau referensi..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 w-[280px]"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Beginning Balance</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(summary.beginningBalance)}</div>
                    </CardContent>
                </Card>
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
                <Card className="bg-muted/50">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Ending Balance</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-primary">{formatCurrency(summary.endingBalance)}</div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Transaction History</CardTitle>
                    <CardDescription>
                        All journal entries for this account ({filteredEntries.length} transactions)
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
                                <TableRow className="bg-muted/30 hover:bg-muted/30">
                                    <TableCell colSpan={6} className="font-medium">Beginning Balance</TableCell>
                                    <TableCell className="text-right font-mono font-semibold">
                                        {formatCurrency(summary.beginningBalance)}
                                    </TableCell>
                                </TableRow>
                                {filteredEntries.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center text-muted-foreground">
                                            {searchTerm ? 'Tidak ada transaksi cocok dengan pencarian' : 'Tidak ada transaksi ditemukan'}
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredEntries.map((entry) => (
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
