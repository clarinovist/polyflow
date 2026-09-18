'use client';

import { useEffect, useState, type ComponentProps, type FormEvent } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    Loader2,
    MoreHorizontal,
    Pencil,
    Phone,
    Search,
    Trash2,
    Users,
    X,
} from 'lucide-react';
import { toast } from 'sonner';

import { deleteCustomer, getCustomerById } from '@/actions/sales/customer';
import { DeleteButton } from '@/components/common/DeleteButton';
import { CustomerActiveToggle } from '@/components/customers/CustomerActiveToggle';
import { CustomerDialog } from '@/components/customers/CustomerDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTablePagination } from '@/components/ui/data-table-pagination';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
    Table,
    TableBody,
    TableCaption,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { salesLabels } from '@/lib/labels';
import { cn, formatRupiah } from '@/lib/utils/utils';
import type {
    CustomerCreditFilter,
    CustomerCreditSummaryPage,
} from '@/services/sales/credit-service';

type FullCustomerForEdit = NonNullable<
    ComponentProps<typeof CustomerDialog>['initialData']
>;

type CustomersPageClientProps = {
    pageData: CustomerCreditSummaryPage;
    error?: string;
};

const FILTERS: { label: string; value: CustomerCreditFilter }[] = [
    { label: 'Semua', value: 'all' },
    { label: 'Aktif', value: 'active' },
    { label: 'Nonaktif', value: 'inactive' },
    { label: 'Punya Limit', value: 'has_limit' },
    { label: 'Over Limit', value: 'over_limit' },
];

export default function CustomersPageClient({
    pageData,
    error,
}: CustomersPageClientProps) {
    const router = useRouter();
    const pathname = usePathname();
    const [search, setSearch] = useState(pageData.search);
    const [customers, setCustomers] = useState(pageData.customers);
    const [editingCustomer, setEditingCustomer] =
        useState<FullCustomerForEdit | null>(null);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [fetchingId, setFetchingId] = useState<string | null>(null);
    const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

    useEffect(() => {
        setSearch(pageData.search);
        setCustomers(pageData.customers);
    }, [pageData]);

    function replaceQuery(changes: Record<string, string | undefined>) {
        const params = new URLSearchParams(window.location.search);
        for (const [name, value] of Object.entries(changes)) {
            if (!value || (name === 'page' && value === '1'))
                params.delete(name);
            else params.set(name, value);
        }
        const query = params.toString();
        router.replace(query ? `${pathname}?${query}` : pathname);
    }

    function submitSearch(event: FormEvent) {
        event.preventDefault();
        replaceQuery({ q: search.trim() || undefined, page: undefined });
    }

    async function handleEditClick(customerId: string) {
        setFetchingId(customerId);
        try {
            const result = await getCustomerById(customerId);
            if (result.success && result.data) {
                setEditingCustomer(result.data);
                setEditDialogOpen(true);
            } else {
                toast.error('Gagal mengambil data customer lengkap.');
            }
        } catch {
            toast.error('Gagal mengambil data customer.');
        } finally {
            setFetchingId(null);
        }
    }

    const firstResult =
        pageData.total === 0 ? 0 : (pageData.page - 1) * pageData.pageSize + 1;
    const lastResult = Math.min(
        pageData.page * pageData.pageSize,
        pageData.total,
    );

    return (
        <div className="space-y-6 p-6">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        {salesLabels.customers}
                    </h1>
                    <p className="text-muted-foreground">
                        {salesLabels.customersDesc}
                    </p>
                </div>
                <CustomerDialog mode="create" />
            </div>

            <div className="space-y-3">
                <form
                    role="search"
                    onSubmit={submitSearch}
                    className="flex gap-2"
                >
                    <div className="relative flex-1">
                        <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                        <Input
                            type="search"
                            name="q"
                            aria-label="Cari customer"
                            placeholder="Cari nama, kode, atau telepon..."
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            className="pl-9 pr-9"
                        />
                        {search && (
                            <button
                                type="button"
                                aria-label="Hapus pencarian customer"
                                onClick={() => {
                                    setSearch('');
                                    replaceQuery({
                                        q: undefined,
                                        page: undefined,
                                    });
                                }}
                                className="text-muted-foreground hover:text-foreground absolute right-3 top-1/2 -translate-y-1/2"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                    <Button type="submit">Cari</Button>
                </form>
                <div
                    className="flex flex-wrap gap-2"
                    aria-label="Filter customer"
                >
                    {FILTERS.map(({ label, value }) => (
                        <Button
                            key={value}
                            type="button"
                            variant={
                                pageData.filter === value
                                    ? 'default'
                                    : 'outline'
                            }
                            size="sm"
                            aria-pressed={pageData.filter === value}
                            onClick={() =>
                                replaceQuery({
                                    filter: value === 'all' ? undefined : value,
                                    page: undefined,
                                })
                            }
                        >
                            {label}
                        </Button>
                    ))}
                </div>
            </div>

            {error && (
                <p role="alert" className="text-destructive text-sm">
                    {error}
                </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-muted-foreground text-sm" role="status">
                    Menampilkan {firstResult}–{lastResult} dari {pageData.total}{' '}
                    customer
                </p>
                <label className="flex items-center gap-2 text-sm">
                    <span>Baris per halaman</span>
                    <select
                        aria-label="Jumlah customer per halaman"
                        value={pageData.pageSize}
                        onChange={(event) =>
                            replaceQuery({
                                pageSize: event.target.value,
                                page: undefined,
                            })
                        }
                        className="border-input bg-background h-9 rounded-md border px-2"
                    >
                        {[25, 50, 100].map((size) => (
                            <option key={size} value={size}>
                                {size}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            <div className="hidden max-h-[calc(100vh-22rem)] overflow-auto rounded-md border md:block">
                <Table>
                    <TableCaption className="sr-only">
                        Daftar customer
                    </TableCaption>
                    <TableHeader className="bg-background sticky top-0 z-10">
                        <TableRow>
                            <TableHead>Kode</TableHead>
                            <TableHead>Nama</TableHead>
                            <TableHead>Kota</TableHead>
                            <TableHead className="text-center">TOP</TableHead>
                            <TableHead className="text-right">Limit</TableHead>
                            <TableHead className="text-right">
                                Headroom
                            </TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="w-[80px] text-right">
                                Aksi
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {customers.length === 0 ? (
                            <TableRow>
                                <TableCell
                                    colSpan={8}
                                    className="h-64 text-center"
                                >
                                    <Users className="text-muted-foreground mx-auto mb-3 h-8 w-8 opacity-50" />
                                    <p className="text-muted-foreground">
                                        Tidak ada customer ditemukan.
                                    </p>
                                </TableCell>
                            </TableRow>
                        ) : (
                            customers.map((customer) => (
                                <TableRow key={customer.id}>
                                    <TableCell className="text-muted-foreground font-mono text-xs">
                                        {customer.code || '-'}
                                    </TableCell>
                                    <TableCell className="font-medium">
                                        <Link
                                            href={`/sales/customers/${customer.id}`}
                                            className="hover:underline"
                                        >
                                            {customer.name}
                                        </Link>
                                    </TableCell>
                                    <TableCell>
                                        {customer.city || '-'}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        {customer.paymentTermDays != null
                                            ? `${customer.paymentTermDays} hari`
                                            : '-'}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {customer.creditLimit != null
                                            ? formatRupiah(customer.creditLimit)
                                            : '-'}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {customer.headroom == null ? (
                                            '-'
                                        ) : (
                                            <span
                                                className={cn(
                                                    customer.exposureStatus ===
                                                        'over' &&
                                                        'font-medium text-red-600',
                                                    customer.exposureStatus ===
                                                        'near' &&
                                                        'font-medium text-amber-600',
                                                )}
                                            >
                                                {formatRupiah(
                                                    customer.headroom,
                                                )}
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-1.5">
                                            <CustomerActiveToggle
                                                id={customer.id}
                                                isActive={customer.isActive}
                                                onToggled={(id, isActive) => {
                                                    setCustomers((current) =>
                                                        current.map((item) =>
                                                            item.id === id
                                                                ? {
                                                                      ...item,
                                                                      isActive,
                                                                  }
                                                                : item,
                                                        ),
                                                    );
                                                    router.refresh();
                                                }}
                                            />
                                            {customer.exposureStatus ===
                                                'over' && (
                                                <Badge variant="destructive">
                                                    Over Limit
                                                </Badge>
                                            )}
                                            {customer.exposureStatus ===
                                                'near' && (
                                                <Badge
                                                    variant="outline"
                                                    className="border-amber-300 text-amber-700"
                                                >
                                                    Mendekati Limit
                                                </Badge>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    aria-label={`Aksi ${customer.name}`}
                                                    disabled={
                                                        fetchingId ===
                                                        customer.id
                                                    }
                                                >
                                                    {fetchingId ===
                                                    customer.id ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    )}
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem
                                                    onSelect={() =>
                                                        handleEditClick(
                                                            customer.id,
                                                        )
                                                    }
                                                >
                                                    <Pencil className="h-4 w-4" />{' '}
                                                    Edit
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    onSelect={(event) => {
                                                        event.preventDefault();
                                                        setDeleteTargetId(
                                                            customer.id,
                                                        );
                                                    }}
                                                    className="text-red-600 focus:text-red-600"
                                                >
                                                    <Trash2 className="h-4 w-4" />{' '}
                                                    Hapus
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                        <DeleteButton
                                            id={customer.id}
                                            onDelete={deleteCustomer}
                                            entityName="Customer"
                                            hideTrigger
                                            open={
                                                deleteTargetId === customer.id
                                            }
                                            onOpenChange={(open) =>
                                                !open && setDeleteTargetId(null)
                                            }
                                            onDeleted={(id) => {
                                                setCustomers((current) =>
                                                    current.filter(
                                                        (item) =>
                                                            item.id !== id,
                                                    ),
                                                );
                                                setDeleteTargetId(null);
                                                router.refresh();
                                            }}
                                        />
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <div className="space-y-3 md:hidden">
                {customers.length === 0 ? (
                    <div className="text-muted-foreground py-12 text-center">
                        Tidak ada customer ditemukan.
                    </div>
                ) : (
                    customers.map((customer) => (
                        <Link
                            key={customer.id}
                            href={`/sales/customers/${customer.id}`}
                            className="block rounded-lg border p-4"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <h2 className="font-semibold">
                                        {customer.name}
                                    </h2>
                                    <p className="text-muted-foreground font-mono text-xs">
                                        {customer.code || '-'}
                                    </p>
                                </div>
                                <Badge
                                    variant={
                                        customer.isActive
                                            ? 'default'
                                            : 'secondary'
                                    }
                                >
                                    {customer.isActive ? 'Aktif' : 'Nonaktif'}
                                </Badge>
                            </div>
                            {customer.phone && (
                                <p className="text-muted-foreground mt-2 flex items-center gap-1 text-xs">
                                    <Phone className="h-3 w-3" />
                                    {customer.phone}
                                </p>
                            )}
                        </Link>
                    ))
                )}
            </div>

            <DataTablePagination
                pageIndex={Math.max(pageData.page - 1, 0)}
                pageCount={pageData.totalPages}
                canPreviousPage={pageData.page > 1}
                canNextPage={pageData.page < pageData.totalPages}
                onFirstPage={() => replaceQuery({ page: undefined })}
                onPreviousPage={() =>
                    replaceQuery({ page: String(pageData.page - 1) })
                }
                onNextPage={() =>
                    replaceQuery({ page: String(pageData.page + 1) })
                }
                onLastPage={() =>
                    replaceQuery({ page: String(pageData.totalPages) })
                }
            />

            {editingCustomer && (
                <CustomerDialog
                    mode="edit"
                    trigger={<span className="hidden" aria-hidden="true" />}
                    initialData={editingCustomer}
                    open={editDialogOpen}
                    onOpenChange={(open) => {
                        setEditDialogOpen(open);
                        if (!open) setEditingCustomer(null);
                    }}
                />
            )}
        </div>
    );
}
