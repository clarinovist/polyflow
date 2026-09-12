'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowDown, ArrowUp, ArrowUpDown, Search, Plus, Eye } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { formatRupiah } from '@/lib/utils/utils';
import { PurchaseOrderStatus } from '@prisma/client';
import { getStatusLabel, purchasingLabels, formLabels } from '@/lib/labels';
import type {
    PurchasingPage,
    PurchasingSortDirection,
} from '@/lib/purchasing/paged-list';
import type { PurchaseOrderSort } from '@/services/purchasing/orders-service';

type POWithRelations = {
    id: string;
    orderNumber: string;
    orderDate: Date | string;
    expectedDate: Date | string | null;
    status: PurchaseOrderStatus;
    totalAmount: number | null;
    supplier: {
        name: string;
        code: string | null;
    };
    _count: {
        items: number;
    };
};

interface PurchaseOrderTableProps {
    orders: POWithRelations[];
    pagination?: Omit<PurchasingPage<never>, 'items'>;
    initialSearch?: string;
    initialStatus?: string;
    initialStartDate?: string;
    initialEndDate?: string;
    sort?: PurchaseOrderSort;
    direction?: PurchasingSortDirection;
}

function ServerSortHeader({
    children,
    active,
    direction,
    onSort,
}: {
    children: string;
    active: boolean;
    direction: PurchasingSortDirection;
    onSort: () => void;
}) {
    const buttonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const tableHead = buttonRef.current?.closest('th');
        if (!tableHead) return;
        tableHead.setAttribute('aria-label', children);
        tableHead.setAttribute(
            'aria-sort',
            active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none',
        );
        return () => {
            tableHead.removeAttribute('aria-label');
            tableHead.removeAttribute('aria-sort');
        };
    }, [active, children, direction]);

    const Icon = active
        ? direction === 'asc'
            ? ArrowUp
            : ArrowDown
        : ArrowUpDown;

    return (
        <button
            ref={buttonRef}
            type="button"
            aria-label={`Urutkan berdasarkan ${children}`}
            onClick={onSort}
            className="flex w-full items-center gap-2 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
            <span className="min-w-0 flex-1">{children}</span>
            <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span className="sr-only">Urutkan berdasarkan {children}</span>
        </button>
    );
}

export function PurchaseOrderTable({
    orders,
    pagination,
    initialSearch = '',
    initialStatus = 'all',
    initialStartDate = '',
    initialEndDate = '',
    sort = 'orderDate',
    direction = 'desc',
}: PurchaseOrderTableProps) {
    const router = useRouter();
    const pathname = usePathname();
    const [searchTerm, setSearchTerm] = useState(initialSearch);
    const [statusFilter, setStatusFilter] = useState(initialStatus);
    const [startDate, setStartDate] = useState(initialStartDate);
    const [endDate, setEndDate] = useState(initialEndDate);

    const updateUrl = useCallback(
        (updates: Record<string, string | undefined>) => {
            const params = new URLSearchParams(window.location.search);
            for (const [key, value] of Object.entries(updates)) {
                if (value) params.set(key, value);
                else params.delete(key);
            }
            const query = params.toString();
            router.push(query ? `${pathname}?${query}` : pathname);
        },
        [pathname, router],
    );

    const applyFilters = () => {
        updateUrl({
            page: '1',
            search: searchTerm.trim() || undefined,
            status: statusFilter === 'all' ? undefined : statusFilter,
            startDate: startDate || undefined,
            endDate: endDate || undefined,
        });
    };

    const goToPage = (page: number) => {
        updateUrl({ page: String(page) });
    };

    const sortHeader = useCallback(
        (key: PurchaseOrderSort, label: string) =>
            pagination ? (
                <ServerSortHeader
                    active={sort === key}
                    direction={direction}
                    onSort={() =>
                        updateUrl({
                            page: '1',
                            sort: key,
                            direction:
                                sort === key && direction === 'desc'
                                    ? 'asc'
                                    : 'desc',
                        })
                    }
                >
                    {label}
                </ServerSortHeader>
            ) : (
                label
            ),
        [direction, pagination, sort, updateUrl],
    );

    const visibleOrders = useMemo(() => {
        if (pagination) return orders;

        const search = searchTerm.trim().toLowerCase();
        return orders.filter((order) => {
            const matchesSearch =
                !search ||
                order.orderNumber.toLowerCase().includes(search) ||
                order.supplier.name.toLowerCase().includes(search);
            const matchesStatus =
                statusFilter === 'all' || order.status === statusFilter;
            return matchesSearch && matchesStatus;
        });
    }, [orders, pagination, searchTerm, statusFilter]);

    const getStatusBadge = (status: PurchaseOrderStatus) => {
        switch (status) {
            case 'DRAFT':
                return (
                    <Badge
                        variant="outline"
                        className="bg-slate-100 text-slate-700 border-slate-200"
                    >
                        {getStatusLabel('DRAFT', 'purchasing')}
                    </Badge>
                );
            case 'SENT':
                return (
                    <Badge
                        variant="outline"
                        className="bg-blue-100 text-blue-700 border-blue-200"
                    >
                        {getStatusLabel('SENT', 'purchasing')}
                    </Badge>
                );
            case 'PARTIAL_RECEIVED':
                return (
                    <Badge
                        variant="outline"
                        className="bg-amber-100 text-amber-700 border-amber-200"
                    >
                        {getStatusLabel('PARTIAL_RECEIVED', 'purchasing')}
                    </Badge>
                );
            case 'RECEIVED':
                return (
                    <Badge
                        variant="outline"
                        className="bg-emerald-100 text-emerald-700 border-emerald-200"
                    >
                        {getStatusLabel('RECEIVED', 'purchasing')}
                    </Badge>
                );
            case 'CANCELLED':
                return (
                    <Badge variant="destructive">
                        {getStatusLabel('CANCELLED', 'purchasing')}
                    </Badge>
                );
            default:
                return (
                    <Badge variant="outline">
                        {getStatusLabel(status, 'purchasing')}
                    </Badge>
                );
        }
    };

    const columns: ColumnDef<POWithRelations, unknown>[] = useMemo(
        () => [
            {
                id: 'orderNumber',
                header: () =>
                    sortHeader('orderDate', purchasingLabels.poNumber),
                size: 160,
                accessorFn: (row) => row.orderNumber,
                enableSorting: !pagination,
                sortingFn: (a, b) =>
                    new Date(a.original.orderDate).getTime() -
                    new Date(b.original.orderDate).getTime(),
                cell: ({ row }) => {
                    const po = row.original;
                    return (
                        <div>
                            <Link
                                href={`/purchasing/orders/${po.id}`}
                                className="font-mono font-medium text-blue-600 dark:text-blue-400 hover:underline"
                            >
                                {po.orderNumber}
                            </Link>
                            <div className="text-xs text-muted-foreground mt-0.5">
                                {format(new Date(po.orderDate), 'dd MMM yyyy')}
                            </div>
                            {po.expectedDate && (
                                <div className="text-[11px] text-muted-foreground mt-0.5">
                                    ETA:{' '}
                                    {format(
                                        new Date(po.expectedDate),
                                        'dd MMM yyyy',
                                    )}
                                </div>
                            )}
                        </div>
                    );
                },
            },
            {
                id: 'supplier',
                header: () => sortHeader('supplier', purchasingLabels.supplier),
                enableSorting: !pagination,
                size: 200,
                accessorFn: (row) => row.supplier.name,
                cell: ({ row }) => (
                    <div className="min-w-0">
                        <div
                            className="font-medium truncate"
                            title={row.original.supplier.name}
                        >
                            {row.original.supplier.name}
                        </div>
                        {row.original.supplier.code && (
                            <span className="text-[10px] text-muted-foreground uppercase block mt-0.5">
                                {row.original.supplier.code}
                            </span>
                        )}
                    </div>
                ),
            },
            {
                accessorKey: 'status',
                header: () => sortHeader('status', formLabels.status),
                enableSorting: !pagination,
                size: 140,
                cell: ({ row }) => getStatusBadge(row.original.status),
            },
            {
                accessorKey: 'totalAmount',
                header: () => sortHeader('totalAmount', 'Total'),
                enableSorting: !pagination,
                size: 150,
                cell: ({ row }) => (
                    <div className="text-right">
                        <div className="font-medium tabular-nums">
                            {formatRupiah(row.original.totalAmount || 0)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                            {row.original._count.items} item
                        </div>
                    </div>
                ),
            },
            {
                id: 'actions',
                header: () => <div className="text-right">Aksi</div>,
                size: 80,
                enableSorting: false,
                cell: ({ row }) => (
                    <div className="text-right">
                        <Link href={`/purchasing/orders/${row.original.id}`}>
                            <Button
                                variant="ghost"
                                size="sm"
                                title="Lihat Detail"
                            >
                                <Eye className="h-4 w-4" />
                            </Button>
                        </Link>
                    </div>
                ),
            },
        ],
        [pagination, sortHeader],
    );

    return (
        <div className="space-y-4">
            <div
                data-sticky-table="true"
                className="max-h-[65vh] overflow-auto [&_.overflow-x-auto]:overflow-visible [&_[data-slot=table-container]]:overflow-visible [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10 [&_thead]:bg-background"
            >
                <DataTable
                    columns={columns}
                    data={visibleOrders}
                    caption="Daftar order pembelian"
                    emptyMessage={purchasingLabels.emptyOrders}
                    minWidth={780}
                >
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                aria-label="Cari order pembelian"
                                placeholder="Cari No. PO atau supplier..."
                                value={searchTerm}
                                onChange={(event) =>
                                    setSearchTerm(event.target.value)
                                }
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') applyFilters();
                                }}
                                className="pl-9 w-[250px]"
                            />
                        </div>
                        <select
                            aria-label="Status order pembelian"
                            value={statusFilter}
                            onChange={(event) =>
                                setStatusFilter(event.target.value)
                            }
                            className="h-9 w-[150px] rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                            <option value="all">Semua Status</option>
                            {Object.values(PurchaseOrderStatus).map((status) => (
                                <option key={status} value={status}>
                                    {getStatusLabel(status, 'purchasing')}
                                </option>
                            ))}
                        </select>
                        <Input
                            aria-label="Tanggal order mulai"
                            type="date"
                            value={startDate}
                            onChange={(event) => setStartDate(event.target.value)}
                            className="w-[150px]"
                        />
                        <Input
                            aria-label="Tanggal order akhir"
                            type="date"
                            value={endDate}
                            onChange={(event) => setEndDate(event.target.value)}
                            className="w-[150px]"
                        />
                        <Button type="button" variant="outline" onClick={applyFilters}>
                            Terapkan filter
                        </Button>
                        <Link href="/purchasing/orders/create">
                            <Button className="bg-blue-600 hover:bg-blue-700">
                                <Plus className="mr-2 h-4 w-4" />
                                Buat PO
                            </Button>
                        </Link>
                    </div>
                </DataTable>
            </div>

            {pagination && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground" role="status">
                        Menampilkan {orders.length} dari {pagination.totalCount}{' '}
                        order
                    </p>
                    <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 text-sm">
                            Baris
                            <select
                                aria-label="Jumlah baris per halaman"
                                value={pagination.pageSize}
                                onChange={(event) =>
                                    updateUrl({
                                        page: '1',
                                        pageSize: event.target.value,
                                    })
                                }
                                className="h-9 rounded-md border border-input bg-background px-2"
                            >
                                {[25, 50, 100].map((size) => (
                                    <option key={size} value={size}>
                                        {size}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <nav
                            aria-label="Paginasi order pembelian"
                            className="flex items-center gap-2"
                        >
                            <span className="text-sm text-muted-foreground">
                                Halaman {pagination.page} dari{' '}
                                {pagination.totalPages || 1}
                            </span>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                aria-label="Halaman sebelumnya"
                                disabled={pagination.page <= 1}
                                onClick={() => goToPage(pagination.page - 1)}
                            >
                                Sebelumnya
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                aria-label="Halaman berikutnya"
                                disabled={
                                    pagination.totalPages === 0 ||
                                    pagination.page >= pagination.totalPages
                                }
                                onClick={() => goToPage(pagination.page + 1)}
                            >
                                Berikutnya
                            </Button>
                        </nav>
                    </div>
                </div>
            )}
        </div>
    );
}
