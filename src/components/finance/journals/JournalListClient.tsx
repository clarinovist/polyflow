'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { columns, JournalEntryWithDetails } from './JournalColumns';
import { getJournalEntries, batchPostJournals } from '@/actions/finance/journal-actions';
import { JournalStatus } from '@prisma/client';
import { TransactionDateFilter } from '@/components/ui/transaction-date-filter';
import { DateRange } from 'react-day-picker';
import { toast } from 'sonner';
// import { DataTable } from '@/components/ui/data-table'; 
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { startOfDay, endOfDay } from 'date-fns';
import { Loader2, Plus } from 'lucide-react';
import { useDebounce } from '@/hooks/use-debounce';
import Link from 'next/link';

// Fallback Simple Table if generic DataTable doesn't exist or is complex to integrate blindly
// Actually, let's implement a simple table using flex/grid or just import Table from ui/table
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    flexRender,
    getCoreRowModel,
    useReactTable,
} from "@tanstack/react-table"

export function JournalListClient() {
    // State
    const [data, setData] = useState<JournalEntryWithDetails[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState<JournalStatus | 'ALL'>('ALL');
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: startOfDay(new Date()),
        to: endOfDay(new Date())
    });
    const [rowSelection, setRowSelection] = useState({});
    const [batchLoading, setBatchLoading] = useState(false);

    const debouncedSearch = useDebounce(search, 500);

    // Fetch Data
    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getJournalEntries({
                search: debouncedSearch,
                status: status !== 'ALL' ? status as JournalStatus : undefined,
                startDate: dateRange?.from ? startOfDay(dateRange.from) : undefined,
                endDate: dateRange?.to ? endOfDay(dateRange.to) : undefined,
                page: 1, // TODO: Pagination
                limit: 100 // Increased for verification
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            setData(res.data as any);
        } catch (error) {
            console.error("Failed to fetch journals", error);
        } finally {
            setLoading(false);
        }
    }, [debouncedSearch, status, dateRange]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);



    const cols = useMemo(() => columns, []);

    // Table Instance
    const table = useReactTable({
        data,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        columns: cols as any,
        state: {
            rowSelection,
        },
        enableRowSelection: true,
        onRowSelectionChange: setRowSelection,
        getCoreRowModel: getCoreRowModel(),
        getRowId: (row) => row.id,
    });

    const selectedRows = table.getFilteredSelectedRowModel().rows;
    const canBatchPost = selectedRows.length > 0 && selectedRows.every(r => r.original.status === 'DRAFT');

    const handleBatchPost = async () => {
        if (!canBatchPost) return;
        setBatchLoading(true);
        try {
            const ids = selectedRows.map(r => r.original.id);
            const res = await batchPostJournals(ids);
            if (res.success) {
                toast.success(`Successfully posted ${ids.length} journals`);
                setRowSelection({});
                fetchData();
            } else {
                toast.error(res.error || "Failed to post journals");
            }
        } catch (error) {
            console.error("Batch post error", error);
            toast.error("An unexpected error occurred");
        } finally {
            setBatchLoading(false);
        }
    };

    // Date Shortcuts removed as they are no longer relevant for daily view

    return (
        <div className="space-y-6 max-w-full overflow-hidden">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Journal Entries</h2>
                    <p className="text-muted-foreground text-sm">Manage and post general ledger transactions from all modules.</p>
                </div>
                <div className="flex items-center gap-2">
                    {selectedRows.length > 0 && (
                        <Button
                            variant="default"
                            className="bg-primary hover:bg-primary/90"
                            onClick={handleBatchPost}
                            disabled={!canBatchPost || batchLoading}
                        >
                            {batchLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Post Selected ({selectedRows.length})
                        </Button>
                    )}
                    <Link href="/finance/journals/create">
                        <Button variant="outline">
                            <Plus className="mr-2 h-4 w-4" /> New Manual Entry
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Filter Card */}
            <Card className="py-3 gap-3 shadow-sm">
                <CardHeader className="px-4 pb-0">
                    <CardTitle className="text-sm font-medium">Filter Transaksi</CardTitle>
                </CardHeader>
                <CardContent className="px-4">
                    <div className="flex flex-wrap items-center gap-4">
                        {/* Search */}
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground whitespace-nowrap">Search:</span>
                            <Input
                                placeholder="Number, ref..."
                                className="h-9 w-[180px] bg-background"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>

                        {/* Status */}
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground whitespace-nowrap">Status:</span>
                            <Select value={status} onValueChange={(val) => setStatus(val as JournalStatus | 'ALL')}>
                                <SelectTrigger className="h-9 w-[140px] bg-background">
                                    <SelectValue placeholder="All" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">All Transactions</SelectItem>
                                    <SelectItem value="DRAFT">Draft Only</SelectItem>
                                    <SelectItem value="POSTED">Posted Entry</SelectItem>
                                    <SelectItem value="VOIDED">Voided</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Date Navigation */}
                        <div className="flex items-center gap-2 ml-auto">
                            <TransactionDateFilter
                                date={dateRange}
                                onDateChange={setDateRange}
                                defaultPreset="today"
                                align="end"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Transaction History</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                {table.getHeaderGroups().map((headerGroup) => (
                                    <TableRow key={headerGroup.id}>
                                        {headerGroup.headers.map((header) => (
                                            <TableHead
                                                key={header.id}
                                                className="h-10 text-xs font-bold uppercase tracking-wider"
                                                style={{ width: header.column.columnDef.size }}
                                            >
                                                {header.isPlaceholder
                                                    ? null
                                                    : flexRender(
                                                        header.column.columnDef.header,
                                                        header.getContext()
                                                    )}
                                            </TableHead>
                                        ))}
                                    </TableRow>
                                ))}
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={columns.length} className="h-32 text-center">
                                            <div className="flex flex-col justify-center items-center gap-2 text-muted-foreground">
                                                <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
                                                <span className="text-sm font-medium">Fetching transactions...</span>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : table.getRowModel().rows?.length ? (
                                    table.getRowModel().rows.map((row) => (
                                        <TableRow
                                            key={row.id}
                                            data-state={row.getIsSelected() && "selected"}
                                            className="hover:bg-muted/50 transition-colors"
                                        >
                                            {row.getVisibleCells().map((cell) => (
                                                <TableCell
                                                    key={cell.id}
                                                    className="py-3 px-4 truncate"
                                                    style={{ width: cell.column.columnDef.size }}
                                                >
                                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={columns.length} className="h-32 text-center text-muted-foreground">
                                            No transactions found for the selected criteria.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
