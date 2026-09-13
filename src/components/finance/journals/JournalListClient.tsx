'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { columns, JournalEntryWithDetails } from './JournalColumns';
import {
    getJournalEntries,
    batchPostJournals,
    type JournalSortColumn,
    type JournalSortDirection,
} from '@/actions/finance/journal-actions';
import { JournalStatus } from '@prisma/client';
import { TransactionDateFilter } from '@/components/common/transaction-date-filter';
import { DateRange } from 'react-day-picker';
import { toast } from 'sonner';
// import { DataTable } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Loader2,
    Plus,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    ArrowDown,
    ArrowUp,
    ArrowUpDown,
} from 'lucide-react';
import { useDebounce } from '@/hooks/use-debounce';
import Link from 'next/link';

const SORTABLE_COLUMNS = new Set<JournalSortColumn>([
    'entryNumber',
    'entryDate',
    'description',
    'reference',
    'status',
]);

function isJournalSortColumn(value: string | null): value is JournalSortColumn {
    return value !== null && SORTABLE_COLUMNS.has(value as JournalSortColumn);
}

// Fallback Simple Table if generic DataTable doesn't exist or is complex to integrate blindly
// Actually, let's implement a simple table using flex/grid or just import Table from ui/table
import {
    Table,
    TableBody,
    TableCaption,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    flexRender,
    getCoreRowModel,
    useReactTable,
} from '@tanstack/react-table';

export function JournalListClient() {
    const urlSearchParams = useSearchParams();
    const urlStatus = urlSearchParams.get('status')?.toUpperCase();
    // State — init from ?status=DRAFT if present
    const [data, setData] = useState<JournalEntryWithDetails[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState<JournalStatus | 'ALL'>(() => {
        if (urlStatus && ['DRAFT', 'POSTED', 'VOIDED'].includes(urlStatus))
            return urlStatus as JournalStatus;
        return 'ALL';
    });

    useEffect(() => {
        if (urlStatus && ['DRAFT', 'POSTED', 'VOIDED'].includes(urlStatus)) {
            setStatus(urlStatus as JournalStatus);
        }
    }, [urlStatus]);
    const [dateRange, setDateRange] = useState<DateRange | undefined>(
        undefined,
    );
    const [rowSelection, setRowSelection] = useState({});
    const [batchLoading, setBatchLoading] = useState(false);
    const [sortBy, setSortBy] = useState<JournalSortColumn>(() => {
        const value = urlSearchParams.get('sortBy');
        return isJournalSortColumn(value) ? value : 'entryDate';
    });
    const [sortDirection, setSortDirection] = useState<JournalSortDirection>(
        () => (urlSearchParams.get('sortDirection') === 'asc' ? 'asc' : 'desc'),
    );

    // Pagination state
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const [total, setTotal] = useState(0);

    const debouncedSearch = useDebounce(search, 500);

    // Reset pagination when filters change
    useEffect(() => {
        setPage(1);
    }, [debouncedSearch, status, dateRange]);

    // Fetch Data
    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getJournalEntries({
                search: debouncedSearch,
                status:
                    status !== 'ALL' ? (status as JournalStatus) : undefined,
                startDate: dateRange?.from ?? undefined,
                endDate: dateRange?.to ?? undefined,
                page,
                limit,
                sortBy,
                sortDirection,
            });
            if (res.success && res.data) {
                setData(res.data.data as JournalEntryWithDetails[]);
                setTotal(res.data.meta.total);
                setPage(res.data.meta.page);
            } else if (!res.success) {
                toast.error(res.error || 'Gagal mengambil jurnal');
            }
        } catch (error) {
            console.error('Failed to fetch journals', error);
        } finally {
            setLoading(false);
        }
    }, [
        debouncedSearch,
        status,
        dateRange,
        page,
        limit,
        sortBy,
        sortDirection,
    ]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const cols = useMemo(() => columns, []);

    const handleSort = (column: JournalSortColumn) => {
        setPage(1);
        if (sortBy === column) {
            setSortDirection((direction) =>
                direction === 'asc' ? 'desc' : 'asc',
            );
            return;
        }
        setSortBy(column);
        setSortDirection('asc');
    };

    // Table Instance
    const table = useReactTable({
        data,
        columns: cols,
        state: {
            rowSelection,
        },
        enableRowSelection: true,
        enableSorting: false,
        onRowSelectionChange: setRowSelection,
        getCoreRowModel: getCoreRowModel(),
        getRowId: (row) => row.id,
    });

    const selectedRows = table.getFilteredSelectedRowModel().rows;
    const canBatchPost =
        selectedRows.length > 0 &&
        selectedRows.every((r) => r.original.status === 'DRAFT');

    const handleBatchPost = async () => {
        if (!canBatchPost) return;
        setBatchLoading(true);
        try {
            const ids = selectedRows.map((r) => r.original.id);
            const res = await batchPostJournals(ids);
            if (res.success) {
                toast.success(
                    `${ids.length} jurnal berhasil diposting. Saldo buku besar telah diperbarui.`,
                );
                setRowSelection({});
                fetchData();
            } else {
                toast.error(res.error || 'Gagal memposting jurnal');
            }
        } catch (error) {
            console.error('Batch post error', error);
            toast.error('Gagal memproses. Silakan coba lagi.');
        } finally {
            setBatchLoading(false);
        }
    };

    // Date Shortcuts removed as they are no longer relevant for daily view

    return (
        <div className="min-w-0 max-w-full space-y-6 overflow-hidden">
            <div className="flex min-w-0 flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">
                        Jurnal
                    </h2>
                    <p className="text-muted-foreground text-sm">
                        Kelola dan posting transaksi buku besar dari semua
                        modul.
                    </p>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    {selectedRows.length > 0 && (
                        <Button
                            variant="default"
                            className="bg-primary hover:bg-primary/90"
                            onClick={handleBatchPost}
                            disabled={!canBatchPost || batchLoading}
                        >
                            {batchLoading ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : null}
                            Post Terpilih ({selectedRows.length})
                        </Button>
                    )}
                    <Link href="/finance/journals/create">
                        <Button variant="outline">
                            <Plus className="mr-2 h-4 w-4" /> Jurnal Manual Baru
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Filter Card */}
            <Card className="py-3 gap-3 shadow-sm">
                <CardHeader className="px-4 pb-0">
                    <h2 className="text-sm font-medium">Filter Transaksi</h2>
                </CardHeader>
                <CardContent className="px-4">
                    <div className="grid min-w-0 grid-cols-1 items-center gap-4 sm:flex sm:flex-wrap">
                        {/* Search */}
                        <div className="grid min-w-0 grid-cols-1 items-start gap-2 sm:flex sm:items-center">
                            <label
                                htmlFor="journal-search"
                                className="text-sm text-muted-foreground whitespace-nowrap"
                            >
                                Cari jurnal
                            </label>
                            <Input
                                id="journal-search"
                                placeholder="Nomor jurnal atau referensi..."
                                className="h-11 w-full min-w-0 bg-background text-base sm:h-9 sm:w-[180px] sm:text-sm"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>

                        {/* Status */}
                        <div className="grid min-w-0 grid-cols-1 items-start gap-2 sm:flex sm:items-center">
                            <label
                                htmlFor="journal-status"
                                className="text-sm text-muted-foreground whitespace-nowrap"
                            >
                                Status jurnal
                            </label>
                            <Select
                                value={status}
                                onValueChange={(val) =>
                                    setStatus(val as JournalStatus | 'ALL')
                                }
                            >
                                <SelectTrigger
                                    id="journal-status"
                                    className="h-11 w-full min-w-0 bg-background sm:h-9 sm:w-[140px]"
                                >
                                    <SelectValue placeholder="Semua" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">
                                        Semua Transaksi
                                    </SelectItem>
                                    <SelectItem value="DRAFT">Draft</SelectItem>
                                    <SelectItem value="POSTED">
                                        Sudah Posting
                                    </SelectItem>
                                    <SelectItem value="VOIDED">
                                        Dibatalkan
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Date Navigation */}
                        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:ml-auto">
                            <TransactionDateFilter
                                date={dateRange}
                                onDateChange={setDateRange}
                                defaultPreset="all"
                                align="end"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <h2 className="text-lg font-semibold">Riwayat Transaksi</h2>
                </CardHeader>
                <CardContent>
                    <div
                        data-journal-scroll
                        role="region"
                        aria-label="Tabel riwayat jurnal; geser horizontal untuk melihat semua kolom dan aksi"
                        tabIndex={0}
                        className="max-h-[70vh] max-w-full overflow-auto rounded-md border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 [&_[data-slot=table-container]]:overflow-visible"
                    >
                        <Table>
                            <TableCaption className="sr-only">
                                Riwayat jurnal
                            </TableCaption>
                            <TableHeader className="sticky top-0 z-10 bg-background">
                                {table.getHeaderGroups().map((headerGroup) => (
                                    <TableRow key={headerGroup.id}>
                                        {headerGroup.headers.map((header) => (
                                            <TableHead
                                                key={header.id}
                                                className="h-10 text-xs font-bold uppercase tracking-wider"
                                                style={{
                                                    width: header.column
                                                        .columnDef.size,
                                                }}
                                                aria-sort={
                                                    isJournalSortColumn(
                                                        header.column.id,
                                                    ) &&
                                                    sortBy === header.column.id
                                                        ? sortDirection ===
                                                          'asc'
                                                            ? 'ascending'
                                                            : 'descending'
                                                        : undefined
                                                }
                                            >
                                                {header.isPlaceholder ? null : isJournalSortColumn(
                                                      header.column.id,
                                                  ) ? (
                                                    <button
                                                        type="button"
                                                        className="flex w-full items-center gap-2 text-left"
                                                        onClick={() =>
                                                            handleSort(
                                                                header.column
                                                                    .id as JournalSortColumn,
                                                            )
                                                        }
                                                        aria-label={`Urutkan berdasarkan ${String(
                                                            header.column
                                                                .columnDef
                                                                .header,
                                                        )}`}
                                                    >
                                                        {flexRender(
                                                            header.column
                                                                .columnDef
                                                                .header,
                                                            header.getContext(),
                                                        )}
                                                        {sortBy ===
                                                        header.column.id ? (
                                                            sortDirection ===
                                                            'asc' ? (
                                                                <ArrowUp className="h-3.5 w-3.5" />
                                                            ) : (
                                                                <ArrowDown className="h-3.5 w-3.5" />
                                                            )
                                                        ) : (
                                                            <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />
                                                        )}
                                                    </button>
                                                ) : (
                                                    flexRender(
                                                        header.column.columnDef
                                                            .header,
                                                        header.getContext(),
                                                    )
                                                )}
                                            </TableHead>
                                        ))}
                                    </TableRow>
                                ))}
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={columns.length}
                                            className="h-32 text-center"
                                        >
                                            <div className="flex flex-col justify-center items-center gap-2 text-muted-foreground">
                                                <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
                                                <span className="text-sm font-medium">
                                                    Mengambil transaksi...
                                                </span>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : table.getRowModel().rows?.length ? (
                                    table.getRowModel().rows.map((row) => (
                                        <TableRow
                                            key={row.id}
                                            data-state={
                                                row.getIsSelected() &&
                                                'selected'
                                            }
                                            className="hover:bg-muted/50 transition-colors"
                                        >
                                            {row
                                                .getVisibleCells()
                                                .map((cell) => (
                                                    <TableCell
                                                        key={cell.id}
                                                        className="py-3 px-4 truncate"
                                                        style={{
                                                            width: cell.column
                                                                .columnDef.size,
                                                        }}
                                                    >
                                                        {flexRender(
                                                            cell.column
                                                                .columnDef.cell,
                                                            cell.getContext(),
                                                        )}
                                                    </TableCell>
                                                ))}
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell
                                            colSpan={columns.length}
                                            className="h-32 text-center text-muted-foreground"
                                        >
                                            Tidak ada transaksi yang ditemukan
                                            untuk kriteria terpilih.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Pagination Footer */}
                    <nav
                        aria-label="Paginasi jurnal"
                        className="flex min-w-0 flex-wrap items-center justify-between gap-4 overflow-x-auto px-2 pt-4"
                    >
                        <div className="flex-1 text-sm text-muted-foreground">
                            Menampilkan{' '}
                            {data.length > 0 ? (page - 1) * limit + 1 : 0}–
                            {Math.min(page * limit, total)} dari {total} jurnal
                        </div>
                        <div className="flex min-w-max items-center space-x-4 lg:space-x-8">
                            <div className="flex items-center space-x-2">
                                <label
                                    htmlFor="journal-page-size"
                                    className="text-sm font-medium"
                                >
                                    Baris per halaman
                                </label>
                                <Select
                                    value={limit.toString()}
                                    onValueChange={(val) => {
                                        setLimit(Number(val));
                                        setPage(1);
                                    }}
                                >
                                    <SelectTrigger
                                        id="journal-page-size"
                                        className="h-8 w-[70px]"
                                    >
                                        <SelectValue placeholder={limit} />
                                    </SelectTrigger>
                                    <SelectContent side="top">
                                        {[10, 20, 50, 100].map((pageSize) => (
                                            <SelectItem
                                                key={pageSize}
                                                value={pageSize.toString()}
                                            >
                                                {pageSize}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex w-[130px] items-center justify-center text-sm font-medium">
                                Halaman {page} dari{' '}
                                {Math.max(1, Math.ceil(total / limit))}
                            </div>
                            <div className="flex items-center space-x-2">
                                <Button
                                    variant="outline"
                                    className="hidden h-8 w-8 p-0 lg:flex"
                                    onClick={() => setPage(1)}
                                    disabled={page === 1}
                                >
                                    <span className="sr-only">
                                        Halaman pertama
                                    </span>
                                    <ChevronsLeft className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="outline"
                                    className="h-8 w-8 p-0"
                                    onClick={() =>
                                        setPage((p) => Math.max(1, p - 1))
                                    }
                                    disabled={page === 1}
                                >
                                    <span className="sr-only">
                                        Halaman sebelumnya
                                    </span>
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="outline"
                                    className="h-8 w-8 p-0"
                                    onClick={() =>
                                        setPage((p) =>
                                            Math.min(
                                                Math.ceil(total / limit),
                                                p + 1,
                                            ),
                                        )
                                    }
                                    disabled={
                                        page >= Math.ceil(total / limit) ||
                                        total === 0
                                    }
                                >
                                    <span className="sr-only">
                                        Halaman berikutnya
                                    </span>
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="outline"
                                    className="hidden h-8 w-8 p-0 lg:flex"
                                    onClick={() =>
                                        setPage(
                                            Math.max(
                                                1,
                                                Math.ceil(total / limit),
                                            ),
                                        )
                                    }
                                    disabled={
                                        page >= Math.ceil(total / limit) ||
                                        total === 0
                                    }
                                >
                                    <span className="sr-only">
                                        Halaman terakhir
                                    </span>
                                    <ChevronsRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </nav>
                </CardContent>
            </Card>
        </div>
    );
}
