'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Download, Calendar as CalendarIcon, FilterX } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface LedgerEntry {
    id: string;
    date: Date;
    type: string;
    qtyIn: number;
    qtyOut: number;
    balance: number;
    fromLocation: string | null;
    toLocation: string | null;
    reference: string | null;
    batch: string | null;
    createdBy: string | null;
}

interface ProductInfo {
    id: string;
    name: string;
    skuCode: string;
    primaryUnit: string;
    type: string;
}

interface StockLedgerData {
    product: ProductInfo;
    entries: LedgerEntry[];
    summary: {
        openingStock: number;
        totalIn: number;
        totalOut: number;
        closingStock: number;
    };
}

interface Location {
    id: string;
    name: string;
}

interface StockLedgerClientProps {
    ledgerData: StockLedgerData;
    locations: Location[];
}

export function StockLedgerClient({ ledgerData, locations }: StockLedgerClientProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { product, entries, summary } = ledgerData;
    const [isExporting, setIsExporting] = useState(false);

    // Filter states from URL
    const now = new Date();
    const defaultStartDate = startOfMonth(now);
    const defaultEndDate = endOfMonth(now);

    const [startDate, setStartDate] = useState<Date | undefined>(
        searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : defaultStartDate
    );
    const [endDate, setEndDate] = useState<Date | undefined>(
        searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : defaultEndDate
    );
    const [locationId, setLocationId] = useState<string>(
        searchParams.get('locationId') || 'all'
    );

    const applyFilters = () => {
        const params = new URLSearchParams();
        if (startDate) params.set('startDate', format(startDate, 'yyyy-MM-dd'));
        if (endDate) params.set('endDate', format(endDate, 'yyyy-MM-dd'));
        if (locationId && locationId !== 'all') params.set('locationId', locationId);

        router.push(`/warehouse/inventory/${product.id}?${params.toString()}`);
    };

    const clearFilters = () => {
        setStartDate(defaultStartDate);
        setEndDate(defaultEndDate);
        setLocationId('all');
        router.push(`/warehouse/inventory/${product.id}`);
    };

    const handleExport = () => {
        setIsExporting(true);
        const headers = ['Date', 'Type', 'Qty IN', 'Qty OUT', 'Balance', 'From', 'To', 'Reference', 'Batch', 'User'];
        const rows = entries.map(e => [
            format(new Date(e.date), 'yyyy-MM-dd HH:mm'),
            e.type,
            e.qtyIn.toString(),
            e.qtyOut.toString(),
            e.balance.toString(),
            e.fromLocation || '',
            e.toLocation || '',
            e.reference || '',
            e.batch || '',
            e.createdBy || ''
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `stock_ledger_${product.skuCode}_${format(new Date(), 'yyyyMMdd')}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
        setIsExporting(false);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.push('/warehouse/inventory')}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Stock Ledger</h1>
                        <p className="text-muted-foreground">
                            {product.skuCode} - {product.name} ({product.primaryUnit})
                        </p>
                    </div>
                </div>
                <Button onClick={handleExport} disabled={isExporting} variant="outline">
                    <Download className="mr-2 h-4 w-4" />
                    {isExporting ? 'Exporting...' : 'Export CSV'}
                </Button>
            </div>

            <Card className="border-amber-100 bg-amber-50/10">
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <FilterX className="h-4 w-4 text-amber-600" />
                        Ledger Filters
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap items-center gap-6">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">Period:</span>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="w-[180px] justify-start text-left font-normal">
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {startDate ? format(startDate, 'dd MMM yyyy') : 'Start'}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar mode="single" selected={startDate} onSelect={setStartDate} initialFocus />
                                </PopoverContent>
                            </Popover>
                            <span className="text-muted-foreground">-</span>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="w-[180px] justify-start text-left font-normal">
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {endDate ? format(endDate, 'dd MMM yyyy') : 'End'}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar mode="single" selected={endDate} onSelect={setEndDate} initialFocus />
                                </PopoverContent>
                            </Popover>
                        </div>

                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">Location:</span>
                            <Select value={locationId} onValueChange={setLocationId}>
                                <SelectTrigger className="w-[220px]">
                                    <SelectValue placeholder="All Locations" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Locations (Consolidated)</SelectItem>
                                    {locations.map(loc => (
                                        <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex items-center gap-2">
                            <Button onClick={applyFilters}>Apply</Button>
                            <Button variant="ghost" onClick={clearFilters}>Reset</Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Opening Stock</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{summary.openingStock} <span className="text-sm font-normal text-muted-foreground">{product.primaryUnit}</span></div>
                    </CardContent>
                </Card>
                <Card className="border-l-4 border-l-emerald-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold uppercase text-muted-foreground tracking-wider text-emerald-600">Total In</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-emerald-700">+{summary.totalIn}</div>
                    </CardContent>
                </Card>
                <Card className="border-l-4 border-l-rose-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold uppercase text-muted-foreground tracking-wider text-rose-600">Total Out</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-rose-700">-{summary.totalOut}</div>
                    </CardContent>
                </Card>
                <Card className="bg-primary/5 border-primary">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold uppercase text-primary tracking-wider">Closing Stock</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-primary">{summary.closingStock} <span className="text-sm font-normal opacity-70">{product.primaryUnit}</span></div>
                    </CardContent>
                </Card>
            </div>

            <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle>Movement History</CardTitle>
                    <CardDescription>
                        Individual stock transactions for {product.name}
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="rounded-md border-t">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/30">
                                    <TableHead className="w-[180px]">Date</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead className="text-right">IN</TableHead>
                                    <TableHead className="text-right">OUT</TableHead>
                                    <TableHead className="text-right font-bold">Balance</TableHead>
                                    <TableHead>Location Logic</TableHead>
                                    <TableHead>Reference / Batch</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <TableRow className="bg-muted/20 font-medium">
                                    <TableCell colSpan={4}>Opening Balance</TableCell>
                                    <TableCell className="text-right font-mono font-bold text-lg">{summary.openingStock}</TableCell>
                                    <TableCell colSpan={2}></TableCell>
                                </TableRow>
                                {entries.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                                            No movements found in this period.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    entries.map((e) => (
                                        <TableRow key={e.id} className="hover:bg-muted/5">
                                            <TableCell className="text-xs text-muted-foreground">
                                                {format(new Date(e.date), 'dd MMM yyyy HH:mm')}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={
                                                    e.type === 'IN' || e.type === 'PURCHASE' ? 'default' :
                                                        e.type === 'OUT' ? 'destructive' : 'secondary'
                                                } className="text-[10px] px-1.5 py-0">
                                                    {e.type}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-emerald-600">
                                                {e.qtyIn > 0 ? `+${e.qtyIn}` : '-'}
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-rose-600">
                                                {e.qtyOut > 0 ? `-${e.qtyOut}` : '-'}
                                            </TableCell>
                                            <TableCell className="text-right font-mono font-bold">
                                                {e.balance}
                                            </TableCell>
                                            <TableCell className="text-xs">
                                                {e.fromLocation && e.toLocation ? (
                                                    <span className="flex items-center gap-1">
                                                        {e.fromLocation} <span className="text-muted-foreground">→</span> {e.toLocation}
                                                    </span>
                                                ) : e.toLocation ? (
                                                    <span className="text-emerald-700">To: {e.toLocation}</span>
                                                ) : (
                                                    <span className="text-rose-700">From: {e.fromLocation}</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <div className="text-xs font-medium truncate max-w-[300px] cursor-default">
                                                                {e.reference || '-'}
                                                            </div>
                                                        </TooltipTrigger>
                                                        {e.reference && (
                                                            <TooltipContent side="top" className="max-w-[400px] whitespace-normal text-xs">
                                                                <p>{e.reference}</p>
                                                                {e.batch && <p className="text-muted-foreground mt-1">Batch: {e.batch}</p>}
                                                            </TooltipContent>
                                                        )}
                                                    </Tooltip>
                                                </TooltipProvider>
                                                {e.batch && (
                                                    <div className="text-[10px] text-muted-foreground font-mono truncate max-w-[300px]">
                                                        Batch: {e.batch}
                                                    </div>
                                                )}
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
