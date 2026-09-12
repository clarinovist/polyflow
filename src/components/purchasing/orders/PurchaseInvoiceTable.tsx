'use client';

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    ArrowDown,
    ArrowRight,
    ArrowUp,
    ArrowUpDown,
    Calendar,
    Loader2,
    Search,
    Trash2,
} from 'lucide-react';
import { format } from 'date-fns';
import { formatRupiah } from '@/lib/utils/utils';
import {
    getStatusLabel,
    purchasingLabels,
    formLabels,
    actionLabels,
} from '@/lib/labels';
import { PurchaseInvoiceStatus } from '@prisma/client';
import Link from 'next/link';
import { deleteInvoice } from '@/actions/finance/invoices';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { isInvoiceOverdue } from '@/lib/finance/payment-terms';
import type {
    PurchasingPage,
    PurchasingSortDirection,
} from '@/lib/purchasing/paged-list';
import type { PurchaseInvoiceSort } from '@/services/purchasing/invoices-service';

type InvoiceWithRelations = {
    id: string;
    invoiceNumber: string;
    // Dates arrive serialized (ISO string) from server components.
    invoiceDate: Date | string;
    dueDate: Date | string | null;
    status: PurchaseInvoiceStatus;
    totalAmount: number;
    paidAmount: number;
    termOfPaymentDays?: number | null;
    purchaseOrderId: string;
    purchaseOrder: {
        id: string;
        orderNumber: string;
        supplier: {
            name: string;
        };
    };
};

interface PurchaseInvoiceTableProps {
    invoices: InvoiceWithRelations[];
    pagination?: Omit<PurchasingPage<never>, 'items'>;
    basePath?: string;
    initialSearch?: string;
    initialStatus?: string;
    overdueMode?: boolean;
    sort?: PurchaseInvoiceSort;
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

export function PurchaseInvoiceTable({
    invoices = [],
    pagination,
    basePath = '/purchasing/orders',
    initialSearch = '',
    initialStatus,
    overdueMode,
    sort = 'invoiceDate',
    direction = 'desc',
}: PurchaseInvoiceTableProps) {
    const router = useRouter();
    const pathname = usePathname();
    const [searchTerm, setSearchTerm] = useState(initialSearch);
    const [isDeleting, setIsDeleting] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>(
        initialStatus || 'ALL',
    );

    useEffect(() => {
        if (initialStatus) setStatusFilter(initialStatus);
    }, [initialStatus]);

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
            status:
                statusFilter === 'ALL' || overdueMode
                    ? undefined
                    : statusFilter,
        });
    };

    const sortHeader = useCallback(
        (key: PurchaseInvoiceSort, label: string) =>
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

    const handleDelete = async (id: string) => {
        setIsDeleting(id);
        try {
            const result = await deleteInvoice(id, 'AP');
            if (result.success) {
                toast.success('Invoice Pembelian berhasil dihapus');
            } else {
                toast.error(
                    result.error ||
                        'Gagal menghapus invoice. Silakan coba lagi.',
                );
            }
        } catch (error) {
            console.error(error);
            toast.error('Gagal memproses invoice. Silakan coba lagi.');
        } finally {
            setIsDeleting(null);
        }
    };

    const filteredInvoices = useMemo(() => {
        const safeInvoices = Array.isArray(invoices) ? invoices : [];
        if (pagination) return safeInvoices;

        const now = new Date();
        return safeInvoices.filter((inv) => {
            // 1. Overdue mode: match board definition (dueDate < now + remaining > 0 + UNPAID/PARTIAL/OVERDUE)
            if (overdueMode) {
                const remaining =
                    (Number(inv.totalAmount) || 0) -
                    (Number(inv.paidAmount) || 0);
                const overdueStatuses: PurchaseInvoiceStatus[] = [
                    PurchaseInvoiceStatus.UNPAID,
                    PurchaseInvoiceStatus.PARTIAL,
                    PurchaseInvoiceStatus.OVERDUE,
                ];
                if (
                    !inv.dueDate ||
                    new Date(inv.dueDate as unknown as string) >= now ||
                    remaining <= 0 ||
                    !overdueStatuses.includes(inv.status)
                ) {
                    return false;
                }
            } else if (statusFilter === 'OVERDUE') {
                if (!isInvoiceOverdue(inv.dueDate, inv.status)) return false;
            } else if (statusFilter !== 'ALL' && inv.status !== statusFilter) {
                return false;
            }

            // 2. Filter by search term
            const lowerSearch = searchTerm.toLowerCase();
            return (
                inv.invoiceNumber.toLowerCase().includes(lowerSearch) ||
                inv.purchaseOrder.orderNumber
                    .toLowerCase()
                    .includes(lowerSearch) ||
                inv.purchaseOrder.supplier.name
                    .toLowerCase()
                    .includes(lowerSearch)
            );
        });
    }, [invoices, pagination, searchTerm, statusFilter, overdueMode]);

    const getStatusBadge = (inv: InvoiceWithRelations) => {
        const status = inv.status;
        const overdue = isInvoiceOverdue(inv.dueDate, status);
        // UNPAID yang belum lewat tempo jangan merah
        const styles: Record<string, string> = {
            UNPAID: overdue
                ? 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-900'
                : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700',
            PARTIAL:
                'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-900',
            PAID: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-900',
            OVERDUE:
                'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-900',
            CANCELLED: 'bg-red-50 text-red-500',
            DRAFT: 'bg-slate-100 text-slate-800',
        };
        return (
            <Badge variant="outline" className={styles[status] ?? styles.DRAFT}>
                {getStatusLabel(status, 'purchasing')}
                {overdue && status === 'UNPAID' ? ' (Terlambat)' : ''}
            </Badge>
        );
    };

    const columns: ColumnDef<InvoiceWithRelations, unknown>[] = useMemo(
        () => [
            {
                id: 'invoiceNumber',
                header: () =>
                    sortHeader('invoiceDate', purchasingLabels.invoiceNumber),
                size: 160,
                accessorFn: (row) => row.invoiceNumber,
                enableSorting: !pagination,
                sortingFn: (a, b) =>
                    new Date(a.original.invoiceDate).getTime() -
                    new Date(b.original.invoiceDate).getTime(),
                cell: ({ row }) => {
                    const inv = row.original;
                    const overdue = isInvoiceOverdue(inv.dueDate, inv.status);
                    return (
                        <div>
                            <Link
                                href={
                                    basePath.startsWith('/finance')
                                        ? `${basePath}/${inv.id}`
                                        : `/purchasing/orders/${inv.purchaseOrder.id}`
                                }
                                className="font-mono font-medium text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                            >
                                {inv.invoiceNumber}
                            </Link>
                            <div className="text-xs text-muted-foreground mt-0.5">
                                {format(
                                    new Date(inv.invoiceDate),
                                    'dd MMM yyyy',
                                )}
                            </div>
                            {inv.dueDate && (
                                <div
                                    className={`text-[11px] mt-0.5 flex items-center gap-1 ${
                                        overdue
                                            ? 'text-red-600 font-semibold'
                                            : 'text-muted-foreground'
                                    }`}
                                >
                                    <Calendar className="h-3 w-3 shrink-0" />
                                    <span>
                                        Jt tempo:{' '}
                                        {format(
                                            new Date(inv.dueDate),
                                            'dd MMM yyyy',
                                        )}
                                    </span>
                                    {overdue && (
                                        <span className="rounded bg-red-100 px-1 text-[10px] text-red-700 dark:bg-red-900/40 dark:text-red-300 font-normal">
                                            Terlambat
                                        </span>
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
                accessorFn: (row) => row.purchaseOrder.supplier.name,
                cell: ({ row }) => (
                    <div className="min-w-0">
                        <div
                            className="font-medium truncate"
                            title={row.original.purchaseOrder.supplier.name}
                        >
                            {row.original.purchaseOrder.supplier.name}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1">
                            <Badge
                                variant="secondary"
                                className="font-mono text-[10px] px-1.5 h-4 font-normal"
                            >
                                PO: {row.original.purchaseOrder.orderNumber}
                            </Badge>
                        </div>
                    </div>
                ),
            },
            {
                accessorKey: 'status',
                header: () => sortHeader('status', formLabels.status),
                enableSorting: !pagination,
                size: 130,
                cell: ({ row }) => getStatusBadge(row.original),
            },
            {
                accessorKey: 'totalAmount',
                header: () => sortHeader('totalAmount', 'Total'),
                enableSorting: !pagination,
                size: 150,
                cell: ({ row }) => {
                    const inv = row.original;
                    const remaining =
                        (Number(inv.totalAmount) || 0) -
                        (Number(inv.paidAmount) || 0);
                    return (
                        <div className="text-right">
                            <div className="font-medium">
                                {formatRupiah(inv.totalAmount)}
                            </div>
                            {inv.paidAmount > 0 && (
                                <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                                    Dibayar: {formatRupiah(inv.paidAmount)}
                                </div>
                            )}
                            {remaining > 0 && inv.paidAmount > 0 && (
                                <div className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                                    Sisa: {formatRupiah(remaining)}
                                </div>
                            )}
                        </div>
                    );
                },
            },
            {
                id: 'actions',
                header: () => <div className="text-right">Aksi</div>,
                size: 100,
                enableSorting: false,
                cell: ({ row }) => {
                    const inv = row.original;
                    return (
                        <div className="flex justify-end gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                asChild
                                title="Lihat Detail"
                            >
                                <Link
                                    href={`${basePath}/${basePath.includes('finance') ? inv.id : inv.purchaseOrder.id}`}
                                >
                                    <ArrowRight className="h-4 w-4" />
                                </Link>
                            </Button>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                        disabled={isDeleting === inv.id}
                                        title="Hapus/Batal"
                                    >
                                        {isDeleting === inv.id ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Trash2 className="h-4 w-4" />
                                        )}
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>
                                            Apakah Anda benar-benar yakin?
                                        </AlertDialogTitle>
                                        <AlertDialogDescription>
                                            Tindakan ini akan menghapus invoice
                                            pembelian{' '}
                                            <strong>{inv.invoiceNumber}</strong>{' '}
                                            secara permanen beserta jurnal
                                            akuntansi terkait dari buku besar.
                                            Tindakan ini tidak dapat dibatalkan.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>
                                            {actionLabels.cancel}
                                        </AlertDialogCancel>
                                        <AlertDialogAction
                                            onClick={() => handleDelete(inv.id)}
                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                        >
                                            Hapus Tagihan & Jurnal
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    );
                },
            },
        ],
        [basePath, isDeleting, pagination, sortHeader],
    );

    return (
        <div className="space-y-4">
            <div
                data-sticky-table="true"
                className="max-h-[65vh] overflow-auto [&_.overflow-x-auto]:overflow-visible [&_[data-slot=table-container]]:overflow-visible [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10 [&_thead]:bg-background"
            >
                <DataTable
                    columns={columns}
                    data={filteredInvoices}
                    caption="Daftar invoice pembelian"
                    emptyMessage={purchasingLabels.emptyInvoices}
                    minWidth={780}
                >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <div className="relative max-w-sm flex-1 sm:w-80">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                aria-label="Cari invoice pembelian"
                                placeholder="Cari invoice, PO, atau supplier..."
                                value={searchTerm}
                                onChange={(event) =>
                                    setSearchTerm(event.target.value)
                                }
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') applyFilters();
                                }}
                                className="pl-9 w-full"
                            />
                        </div>
                        {!overdueMode && (
                            <Select
                                value={statusFilter}
                                onValueChange={setStatusFilter}
                            >
                                <SelectTrigger
                                    aria-label="Status invoice pembelian"
                                    className="w-[180px]"
                                >
                                    <SelectValue placeholder="Semua Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">Semua Status</SelectItem>
                                    <SelectItem value="DRAFT">Draft</SelectItem>
                                    <SelectItem value="UNPAID">
                                        Belum Dibayar
                                    </SelectItem>
                                    <SelectItem value="PARTIAL">
                                        Dibayar Sebagian
                                    </SelectItem>
                                    <SelectItem value="PAID">Lunas</SelectItem>
                                    <SelectItem value="OVERDUE">
                                        Lewat Jatuh Tempo
                                    </SelectItem>
                                    <SelectItem value="CANCELLED">
                                        Dibatalkan
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        )}
                        {pagination && (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={applyFilters}
                            >
                                Terapkan filter
                            </Button>
                        )}
                    </div>
                </DataTable>
            </div>

            {pagination && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground" role="status">
                        Menampilkan {invoices.length} dari {pagination.totalCount}{' '}
                        invoice
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
                            aria-label="Paginasi invoice pembelian"
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
                                onClick={() =>
                                    updateUrl({
                                        page: String(pagination.page - 1),
                                    })
                                }
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
                                onClick={() =>
                                    updateUrl({
                                        page: String(pagination.page + 1),
                                    })
                                }
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
