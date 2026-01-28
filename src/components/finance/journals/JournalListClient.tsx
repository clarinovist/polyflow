'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { columns, JournalEntryWithDetails } from './JournalColumns';
import { getJournalEntries } from '@/actions/finance/journal-actions';
// import { DataTable } from '@/components/ui/data-table'; 
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDebounce } from '@/hooks/use-debounce'; // Assuming hook exists
import { Loader2, Plus } from 'lucide-react';
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
    const [status, setStatus] = useState<string>('ALL');

    const debouncedSearch = useDebounce(search, 500);

    // Fetch Data
    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getJournalEntries({
                search: debouncedSearch,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                status: status !== 'ALL' ? status as any : undefined,
                page: 1, // TODO: Pagination
                limit: 50
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            setData(res.data as any);
        } catch (error) {
            console.error("Failed to fetch journals", error);
        } finally {
            setLoading(false);
        }
    }, [debouncedSearch, status]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const cols = useMemo(() => columns, []);

    // Table Instance
    const table = useReactTable({
        data,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        columns: cols as any,
        getCoreRowModel: getCoreRowModel(),
    });

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Journal Entries</h2>
                    <p className="text-muted-foreground">Manage and view general ledger transactions.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Link href="/finance/journals/create">
                        <Button>
                            <Plus className="mr-2 h-4 w-4" /> New Entry
                        </Button>
                    </Link>
                </div>
            </div>

            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-base">Transactions</CardTitle>
                        <div className="flex items-center gap-2">
                            <Input
                                placeholder="Search journals..."
                                className="w-[200px] h-8"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                            <Select value={status} onValueChange={setStatus}>
                                <SelectTrigger className="w-[130px] h-8">
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">All Status</SelectItem>
                                    <SelectItem value="DRAFT">Draft</SelectItem>
                                    <SelectItem value="POSTED">Posted</SelectItem>
                                    <SelectItem value="VOID">Void</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                {table.getHeaderGroups().map((headerGroup) => (
                                    <TableRow key={headerGroup.id}>
                                        {headerGroup.headers.map((header) => {
                                            return (
                                                <TableHead key={header.id}>
                                                    {header.isPlaceholder
                                                        ? null
                                                        : flexRender(
                                                            header.column.columnDef.header,
                                                            header.getContext()
                                                        )}
                                                </TableHead>
                                            )
                                        })}
                                    </TableRow>
                                ))}
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={columns.length} className="h-24 text-center">
                                            <div className="flex justify-center items-center gap-2 text-muted-foreground">
                                                <Loader2 className="h-4 w-4 animate-spin" /> Loading...
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : table.getRowModel().rows?.length ? (
                                    table.getRowModel().rows.map((row) => (
                                        <TableRow
                                            key={row.id}
                                            data-state={row.getIsSelected() && "selected"}
                                        >
                                            {row.getVisibleCells().map((cell) => (
                                                <TableCell key={cell.id}>
                                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={columns.length} className="h-24 text-center">
                                            No results.
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
