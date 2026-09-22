import Link from 'next/link';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { BomCategory } from '@prisma/client';
import {
    Activity,
    AlertCircle,
    ChevronLeft,
    ChevronRight,
    Clock,
    Layers,
    Plus,
    Search,
    X,
} from 'lucide-react';
import {
    getProductionOrdersList,
    getProductionOrderStats,
} from '@/actions/production/production-orders';
import { PRODUCTION_ORDERS_LIST_DEFAULT_PAGE_SIZE as PAGE_SIZE } from '@/lib/constants/production';
import { getEnteredQuantityDisplay } from '@/lib/utils/production-units';
import { getStatusLabel } from '@/lib/labels/helpers';
import { cn } from '@/lib/utils/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { ContextualHelp } from '@/components/support/contextual-help';
import { ProductionOrderViews } from '@/components/production/ProductionOrderViews';
import { ProductionPriorityBadge } from '@/components/production/production-priority-badge';
import { ProductionStatusBadge } from '@/components/production/production-status-badge';

const STATUSES = [
    'DRAFT',
    'WAITING_MATERIAL',
    'RELEASED',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED',
] as const;
const CATEGORIES = [
    { value: 'all', label: 'Semua tahap' },
    { value: 'mixing', label: 'Mixing' },
    { value: 'extrusion', label: 'Extrusion' },
    { value: 'packing', label: 'Packing' },
    { value: 'rework', label: 'Rework' },
];

type Filters = {
    category?: string;
    status?: string;
    q?: string;
    late?: string;
    page?: string;
};

export default async function ProductionOrdersPage({
    searchParams,
}: {
    searchParams: Promise<Filters>;
}) {
    const { category, status, q, late, page: pageParam } = await searchParams;
    const bomCategories: BomCategory[] | undefined =
        category === 'mixing'
            ? ['MIXING']
            : category === 'extrusion'
              ? ['EXTRUSION', 'STANDARD']
              : category === 'packing'
                ? ['PACKING']
                : category === 'rework'
                  ? ['REWORK']
                  : undefined;
    const statusFilter = STATUSES.find((value) => value === status);
    const isAllFilter = status === 'ALL';
    const isLateFilter = late === '1';
    const searchQuery = typeof q === 'string' ? q.trim() : '';
    const excludeCompletedDefault =
        !statusFilter && !isLateFilter && !isAllFilter;
    const parsedPage = Number.parseInt(pageParam || '1', 10);
    const currentPage =
        Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const [{ orders, total }, stats] = await Promise.all([
        getProductionOrdersList({
            bomCategories,
            status: statusFilter,
            q: searchQuery || undefined,
            late: isLateFilter || undefined,
            excludeCompleted: excludeCompletedDefault || undefined,
            page: currentPage,
        }),
        getProductionOrderStats(),
    ]);
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const buildHref = (
        overrides: Partial<Record<keyof Filters, string | null>>,
    ) => {
        const next = {
            category,
            status,
            q: searchQuery,
            late,
            page: pageParam,
            ...overrides,
        };
        if (Object.keys(overrides).some((key) => key !== 'page'))
            next.page = overrides.page ?? null;
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(next)) {
            if (
                value &&
                !(key === 'category' && value === 'all') &&
                !(key === 'page' && value === '1')
            )
                params.set(key, value);
        }
        return `/production/orders${params.size ? `?${params}` : ''}`;
    };
    const hasActiveFilters = !!(
        statusFilter ||
        isLateFilter ||
        isAllFilter ||
        searchQuery ||
        (category && category !== 'all')
    );
    const filterLabel = isLateFilter
        ? 'Terlambat'
        : isAllFilter
          ? 'Semua status'
          : statusFilter
            ? getStatusLabel(statusFilter, 'production')
            : 'Selain Selesai';
    const metrics = [
        {
            label: 'Total SPK',
            value: stats.totalOrders,
            icon: Layers,
            href: buildHref({ status: 'ALL', late: null }),
            selected: isAllFilter && !isLateFilter,
            description: 'Seluruh status',
        },
        {
            label: 'Sedang diproduksi',
            value: stats.activeCount,
            icon: Activity,
            href: buildHref({ status: 'IN_PROGRESS', late: null }),
            selected: statusFilter === 'IN_PROGRESS' && !isLateFilter,
            description: 'Pekerjaan berjalan',
        },
        {
            label: 'Belum dimulai',
            value: stats.draftCount,
            icon: Clock,
            href: undefined,
            selected: false,
            description: 'Draft + Siap Produksi + Menunggu Bahan',
        },
        {
            label: 'Terlambat',
            value: stats.lateCount,
            icon: AlertCircle,
            href: buildHref({ status: null, late: '1' }),
            selected: isLateFilter,
            description: 'Melewati rencana selesai',
        },
    ];

    return (
        <div className="mx-auto max-w-[1600px] space-y-6 py-2">
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Produksi / SPK
                    </p>
                    <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">
                        Surat Perintah Kerja
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Pantau pekerjaan produksi dari rencana hingga selesai.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <ContextualHelp
                        title="Panduan SPK"
                        prefillQuestion="Cara buat SPK batch harian di Polyflow?"
                        links={[
                            {
                                title: 'Cara Buat SPK Batch Harian',
                                slug: 'cara-spk-batch-harian',
                            },
                            {
                                title: 'Cara Input Hasil via Kiosk',
                                slug: 'cara-input-hasil-kiosk',
                            },
                            {
                                title: 'Error Backflush / Stok Bahan',
                                slug: 'error-backflush-atau-stok-bahan',
                            },
                        ]}
                    />
                    <Button asChild className="min-h-11 gap-2">
                        <Link href="/production/orders/create">
                            <Plus className="h-4 w-4" />
                            Buat SPK
                        </Link>
                    </Button>
                </div>
            </header>

            <section aria-label="Ringkasan seluruh SPK" className="space-y-2">
                <h2 className="text-xs font-medium text-muted-foreground">
                    Ringkasan seluruh SPK · tidak mengikuti filter daftar
                </h2>
                <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                    {metrics.map(
                        ({
                            label,
                            value,
                            icon: Icon,
                            href,
                            selected,
                            description,
                        }) => {
                            const content = (
                                <>
                                    <div className="flex items-start justify-between gap-2 text-sm">
                                        <span className="font-medium">
                                            {label}
                                        </span>
                                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                                    </div>
                                    <p className="mt-2 text-2xl font-semibold tabular-nums">
                                        {value}
                                    </p>
                                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                        {description}
                                    </p>
                                </>
                            );
                            const className = cn(
                                'rounded-xl border bg-card p-4',
                                selected &&
                                    'border-emerald-600 ring-1 ring-emerald-600',
                                href &&
                                    'transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring',
                            );
                            return href ? (
                                <Link
                                    key={label}
                                    href={href}
                                    aria-current={selected ? 'true' : undefined}
                                    className={className}
                                >
                                    {content}
                                </Link>
                            ) : (
                                <div key={label} className={className}>
                                    {content}
                                </div>
                            );
                        },
                    )}
                </div>
            </section>

            <section
                aria-label="Daftar SPK"
                className="overflow-hidden rounded-xl border bg-card shadow-sm"
            >
                <div className="space-y-4 border-b p-4 md:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <ProductionOrderViews current="list" />
                        <p className="text-sm text-muted-foreground">
                            {total} hasil · {filterLabel}
                        </p>
                    </div>
                    <nav
                        aria-label="Filter tahap produksi"
                        className="flex flex-wrap gap-1 border-b"
                    >
                        {CATEGORIES.map((item) => (
                            <Link
                                key={item.value}
                                href={buildHref({ category: item.value })}
                                aria-current={
                                    (category || 'all') === item.value
                                        ? 'page'
                                        : undefined
                                }
                                className={cn(
                                    'inline-flex min-h-11 items-center border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground hover:text-foreground',
                                    (category || 'all') === item.value &&
                                        'border-emerald-600 text-emerald-700 dark:text-emerald-400',
                                )}
                            >
                                {item.label}
                            </Link>
                        ))}
                    </nav>
                    <form
                        action="/production/orders"
                        method="GET"
                        className="flex flex-wrap items-end gap-3"
                    >
                        {category && category !== 'all' && (
                            <input
                                type="hidden"
                                name="category"
                                value={category}
                            />
                        )}
                        {isLateFilter && (
                            <input type="hidden" name="late" value="1" />
                        )}
                        <div className="min-w-0 flex-1 basis-64 space-y-1.5">
                            <label
                                htmlFor="spk-search"
                                className="text-xs font-medium"
                            >
                                Cari SPK
                            </label>
                            <div className="relative">
                                <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="spk-search"
                                    name="q"
                                    defaultValue={searchQuery}
                                    placeholder="No. SPK, produk, resep, mesin…"
                                    className="min-h-11 pl-9 pr-10"
                                />
                                {searchQuery && (
                                    <Link
                                        href={buildHref({ q: null })}
                                        aria-label="Hapus pencarian"
                                        className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center"
                                    >
                                        <X className="h-4 w-4" />
                                    </Link>
                                )}
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label
                                htmlFor="spk-status"
                                className="block text-xs font-medium"
                            >
                                Status
                            </label>
                            <select
                                id="spk-status"
                                name="status"
                                defaultValue={
                                    isAllFilter ? 'ALL' : statusFilter || ''
                                }
                                className="min-h-11 max-w-full rounded-md border border-input bg-background px-3 text-sm"
                            >
                                <option value="">Selain Selesai</option>
                                <option value="ALL">Semua status</option>
                                {STATUSES.map((value) => (
                                    <option key={value} value={value}>
                                        {getStatusLabel(value, 'production')}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <Button
                            type="submit"
                            variant="secondary"
                            className="min-h-11"
                        >
                            Cari
                        </Button>
                        <Button
                            asChild
                            variant="outline"
                            className={cn(
                                'min-h-11',
                                isLateFilter &&
                                    'border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
                            )}
                        >
                            <Link
                                href={buildHref({
                                    status: null,
                                    late: isLateFilter ? null : '1',
                                })}
                                aria-current={isLateFilter ? 'true' : undefined}
                            >
                                <Clock className="h-4 w-4" />
                                Terlambat
                            </Link>
                        </Button>
                    </form>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                        <p>
                            {isLateFilter
                                ? 'Terlambat: Siap Produksi / Sedang Diproduksi melewati rencana selesai.'
                                : excludeCompletedDefault
                                  ? 'Hanya status Selesai yang disembunyikan; SPK dibatalkan tetap ditampilkan.'
                                  : 'Daftar mengikuti tahap, status, dan pencarian yang dipilih.'}
                        </p>
                        {hasActiveFilters && (
                            <Link
                                href="/production/orders"
                                className="inline-flex min-h-9 items-center font-medium text-foreground underline underline-offset-4"
                            >
                                Hapus semua filter
                            </Link>
                        )}
                    </div>
                </div>
                {orders.length > 0 && (
                    <div
                        className="divide-y md:hidden"
                        aria-label="Daftar SPK mobile"
                    >
                        {orders.map((order) => (
                            <article key={order.id} className="space-y-3 p-4">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <Link
                                        href={`/production/orders/${order.id}`}
                                        className="min-h-11 font-mono text-sm font-semibold underline underline-offset-4"
                                    >
                                        {order.orderNumber}
                                    </Link>
                                    <ProductionStatusBadge
                                        status={order.status}
                                    />
                                </div>
                                <div>
                                    <h3 className="font-medium">
                                        {order.bom.productVariant.name}
                                    </h3>
                                    <p className="text-xs text-muted-foreground">
                                        {order.bom.name}
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <ProductionPriorityBadge
                                        priority={order.priority}
                                    />
                                    {order.isMaklon && (
                                        <Badge variant="outline">Maklon</Badge>
                                    )}
                                </div>
                                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
                                    <dt className="text-muted-foreground">
                                        Mulai / mesin
                                    </dt>
                                    <dd>
                                        {format(
                                            new Date(order.plannedStartDate),
                                            'd MMM yyyy',
                                            { locale: idLocale },
                                        )}{' '}
                                        ·{' '}
                                        {order.machine?.code ||
                                            'Belum ditentukan'}
                                    </dd>
                                    <dt className="text-muted-foreground">
                                        Sumber
                                    </dt>
                                    <dd>
                                        {order.salesOrder?.customer?.name ||
                                            order.salesOrder?.orderNumber ||
                                            'Stok internal'}
                                    </dd>
                                    <dt className="text-muted-foreground">
                                        Hasil
                                    </dt>
                                    <dd>
                                        {Number(
                                            order.actualQuantity || 0,
                                        ).toLocaleString('id-ID')}{' '}
                                        {order.bom.productVariant.primaryUnit}
                                    </dd>
                                    <dt className="text-muted-foreground">
                                        Target
                                    </dt>
                                    <dd>
                                        {getEnteredQuantityDisplay({
                                            ...order.bom.productVariant,
                                            quantity: order.plannedQuantity,
                                            enteredQuantity:
                                                order.plannedEnteredQuantity,
                                            enteredUnit:
                                                order.plannedEnteredUnit,
                                            conversionFactorSnapshot:
                                                order.plannedConversionFactorSnapshot,
                                        })}
                                    </dd>
                                </dl>
                                <Button
                                    asChild
                                    variant="outline"
                                    className="min-h-11 w-full"
                                >
                                    <Link
                                        href={`/production/orders/${order.id}`}
                                    >
                                        Buka SPK
                                        <ChevronRight className="h-4 w-4" />
                                    </Link>
                                </Button>
                            </article>
                        ))}
                    </div>
                )}
                <div className={orders.length ? 'hidden md:block' : ''}>
                    <Table className="min-w-[900px]">
                        <TableHeader>
                            <TableRow className="bg-muted/40">
                                <TableHead className="pl-5">No. SPK</TableHead>
                                <TableHead>Produk & resep</TableHead>
                                <TableHead>Jadwal & mesin</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Hasil / target</TableHead>
                                <TableHead className="pr-5">
                                    <span className="sr-only">Detail</span>
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {orders.length === 0 ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={6}
                                        className="py-16 text-center"
                                    >
                                        <p className="font-medium">
                                            {hasActiveFilters
                                                ? 'Tidak ada SPK yang cocok'
                                                : 'Belum ada SPK untuk ditampilkan'}
                                        </p>
                                        <p className="mt-1 text-sm text-muted-foreground">
                                            {hasActiveFilters
                                                ? 'Coba kata kunci lain atau hapus filter.'
                                                : 'Buat SPK untuk mulai merencanakan produksi.'}
                                        </p>
                                        <div className="mt-4 flex justify-center gap-2">
                                            {hasActiveFilters && (
                                                <Button
                                                    asChild
                                                    variant="outline"
                                                >
                                                    <Link href="/production/orders">
                                                        Hapus filter
                                                    </Link>
                                                </Button>
                                            )}
                                            <Button asChild>
                                                <Link href="/production/orders/create">
                                                    Buat SPK
                                                </Link>
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                orders.map((order) => {
                                    const progress =
                                        (Number(order.actualQuantity || 0) /
                                            Number(
                                                order.plannedQuantity || 1,
                                            )) *
                                        100;
                                    const href = `/production/orders/${order.id}`;
                                    return (
                                        <TableRow
                                            key={order.id}
                                            className="group"
                                        >
                                            <TableCell className="py-4 pl-5 align-top">
                                                <Link
                                                    href={href}
                                                    className="font-mono text-sm font-medium underline-offset-4 hover:underline"
                                                >
                                                    {order.orderNumber}
                                                </Link>
                                                <div className="mt-2 flex flex-wrap gap-1">
                                                    <ProductionPriorityBadge
                                                        priority={
                                                            order.priority
                                                        }
                                                    />
                                                    {order.isMaklon && (
                                                        <Badge variant="outline">
                                                            Maklon
                                                        </Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="max-w-72 py-4 align-top">
                                                <Link
                                                    href={href}
                                                    className="font-medium hover:underline"
                                                >
                                                    {
                                                        order.bom.productVariant
                                                            .name
                                                    }
                                                </Link>
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    {order.bom.name}
                                                </p>
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    {order.salesOrder
                                                        ? `Sumber: ${order.salesOrder.customer?.name || order.salesOrder.orderNumber}`
                                                        : 'Stok internal'}
                                                </p>
                                            </TableCell>
                                            <TableCell className="py-4 align-top">
                                                <p className="text-sm">
                                                    {format(
                                                        new Date(
                                                            order.plannedStartDate,
                                                        ),
                                                        'd MMM yyyy',
                                                        { locale: idLocale },
                                                    )}
                                                </p>
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    {order.machine?.code ||
                                                        'Mesin belum ditentukan'}
                                                </p>
                                            </TableCell>
                                            <TableCell className="py-4 align-top">
                                                <ProductionStatusBadge
                                                    status={order.status}
                                                />
                                            </TableCell>
                                            <TableCell className="min-w-44 py-4 align-top">
                                                <p className="text-sm tabular-nums">
                                                    {Number(
                                                        order.actualQuantity ||
                                                            0,
                                                    ).toLocaleString(
                                                        'id-ID',
                                                    )}{' '}
                                                    /{' '}
                                                    {Number(
                                                        order.plannedQuantity,
                                                    ).toLocaleString(
                                                        'id-ID',
                                                    )}{' '}
                                                    {
                                                        order.bom.productVariant
                                                            .primaryUnit
                                                    }
                                                </p>
                                                <div className="mt-2 flex items-center gap-2">
                                                    <Progress
                                                        aria-label={`Progres ${order.orderNumber}`}
                                                        value={Math.min(
                                                            progress,
                                                            100,
                                                        )}
                                                        className="h-1.5 w-20"
                                                    />
                                                    <span className="text-xs tabular-nums text-muted-foreground">
                                                        {Math.round(progress)}%
                                                    </span>
                                                </div>
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    Target:{' '}
                                                    {getEnteredQuantityDisplay({
                                                        ...order.bom
                                                            .productVariant,
                                                        quantity:
                                                            order.plannedQuantity,
                                                        enteredQuantity:
                                                            order.plannedEnteredQuantity,
                                                        enteredUnit:
                                                            order.plannedEnteredUnit,
                                                        conversionFactorSnapshot:
                                                            order.plannedConversionFactorSnapshot,
                                                    })}
                                                </p>
                                            </TableCell>
                                            <TableCell className="pr-5 align-top">
                                                <Button
                                                    asChild
                                                    variant="ghost"
                                                    className="h-11 w-11 p-0"
                                                >
                                                    <Link
                                                        href={href}
                                                        aria-label={`Lihat detail ${order.orderNumber}`}
                                                    >
                                                        <ChevronRight className="h-4 w-4" />
                                                    </Link>
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>
                {totalPages > 1 && (
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4 text-sm">
                        <p className="text-muted-foreground">
                            Halaman {currentPage} dari {totalPages} ·{' '}
                            {PAGE_SIZE} per halaman
                        </p>
                        <div className="flex gap-2">
                            {currentPage <= 1 ? (
                                <Button variant="outline" disabled>
                                    Sebelumnya
                                </Button>
                            ) : (
                                <Button asChild variant="outline">
                                    <Link
                                        href={buildHref({
                                            page: String(currentPage - 1),
                                        })}
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                        Sebelumnya
                                    </Link>
                                </Button>
                            )}
                            {currentPage >= totalPages ? (
                                <Button variant="outline" disabled>
                                    Berikutnya
                                </Button>
                            ) : (
                                <Button asChild variant="outline">
                                    <Link
                                        href={buildHref({
                                            page: String(currentPage + 1),
                                        })}
                                    >
                                        Berikutnya
                                        <ChevronRight className="h-4 w-4" />
                                    </Link>
                                </Button>
                            )}
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
}
