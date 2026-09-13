'use client';

import Link from 'next/link';

import { useState, type FormEvent } from 'react';
import { ProductType } from '@prisma/client';
import { formatUnitLabel } from '@/lib/utils/unit-label';
import {
    Table,
    TableBody,
    TableCaption,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Edit,
    Trash2,
    Info,
    Package,
    Search,
    Archive,
    ArchiveRestore,
} from 'lucide-react';
import { formatRupiah } from '@/lib/utils/utils';
import { deleteVariant, archiveVariant, unarchiveVariant } from '@/actions/product';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { DataTablePagination } from '@/components/ui/data-table-pagination';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import type {
    ProductCatalogPage,
    ProductCatalogSortKey,
    ProductCatalogVariant,
} from '@/actions/product/product-catalog-types';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import {
    productTypeBadgeLabels,
    productTableLabels,
} from '@/lib/labels/products';

type ProductVariant = ProductCatalogVariant;

interface ProductTableProps {
    catalogPage: ProductCatalogPage;
    showPrices?: boolean;
}

const productTypeBadgeColors: Record<ProductType, string> = {
    RAW_MATERIAL:
        'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/10 hover:bg-blue-500/20',
    FINISHED_GOOD:
        'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/10 hover:bg-green-500/20',
    SCRAP: 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/10 hover:bg-gray-500/20',
    INTERMEDIATE:
        'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/10 hover:bg-purple-500/20',
    PACKAGING:
        'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/10 hover:bg-orange-500/20',
    AUXILIARY:
        'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/10 hover:bg-indigo-500/20',
    WIP: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/10 hover:bg-yellow-500/20',
    SERVICE:
        'bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/10 hover:bg-pink-500/20',
    OPERATIONAL:
        'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/10 hover:bg-teal-500/20',
    FIXED_ASSET:
        'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/10 hover:bg-amber-500/20',
};

export function ProductTable({
    catalogPage,
    showPrices = false,
}: ProductTableProps) {
    const { items: variants, page, pageSize, total, pageCount, query } =
        catalogPage;
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [variantToDelete, setVariantToDelete] =
        useState<ProductVariant | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
    const [variantToArchive, setVariantToArchive] =
        useState<ProductVariant | null>(null);
    const [isArchiving, setIsArchiving] = useState(false);
    const router = useRouter();

    const buildCatalogUrl = (
        overrides: Partial<{
            search: string;
            page: number;
            pageSize: number;
            sort: ProductCatalogSortKey;
            direction: 'asc' | 'desc';
        }> = {},
    ) => {
        const next = { ...query, page, pageSize, ...overrides };
        const params = new URLSearchParams();
        if (next.search) params.set('q', next.search);
        if (next.type) params.set('type', next.type);
        if (next.includeArchived) params.set('archived', '1');
        params.set('page', String(next.page));
        params.set('pageSize', String(next.pageSize));
        params.set('sort', next.sort);
        params.set('direction', next.direction);
        return `/dashboard/products?${params.toString()}`;
    };

    const handleSearch = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const search = String(formData.get('q') ?? '').trim();
        router.push(buildCatalogUrl({ search, page: 1 }));
    };

    const handleSort = (sort: ProductCatalogSortKey) => {
        const direction =
            query.sort === sort && query.direction === 'desc' ? 'asc' : 'desc';
        router.push(buildCatalogUrl({ sort, direction, page: 1 }));
    };

    const sortDirection = (sort: ProductCatalogSortKey) =>
        query.sort === sort ? query.direction : false;

    const firstResult = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const lastResult = Math.min(page * pageSize, total);
    const actionName = (action: string, variant: ProductVariant) =>
        `${action} ${variant.name || variant.productName} (${variant.skuCode})`;

    const handleDeleteClick = (variant: ProductVariant) => {
        setVariantToDelete(variant);
        setDeleteDialogOpen(true);
    };

    const handleDeleteConfirm = async () => {
        if (!variantToDelete) return;

        setIsDeleting(true);
        const result = await deleteVariant(variantToDelete.id);

        if (result.success) {
            toast.success('Variant produk berhasil dihapus.');
            setDeleteDialogOpen(false);
            setVariantToDelete(null);
            router.refresh();
        } else {
            toast.error(result.error || 'Gagal menghapus varian produk.');
        }
        setIsDeleting(false);
    };

    const handleEditClick = (productId: string) => {
        router.push(`/dashboard/products/${productId}/edit`);
    };

    const handleArchiveClick = (variant: ProductVariant) => {
        setVariantToArchive(variant);
        setArchiveDialogOpen(true);
    };

    const handleArchiveConfirm = async () => {
        if (!variantToArchive) return;

        setIsArchiving(true);
        const result = await archiveVariant(variantToArchive.id);

        if (result.success) {
            toast.success('Varian produk berhasil diarsipkan.');
            setArchiveDialogOpen(false);
            setVariantToArchive(null);
            router.refresh();
        } else {
            toast.error(result.error || 'Gagal mengarsipkan varian produk.');
        }
        setIsArchiving(false);
    };

    const handleUnarchive = async (variant: ProductVariant) => {
        const result = await unarchiveVariant(variant.id);
        if (result.success) {
            toast.success('Varian produk berhasil dipulihkan.');
            router.refresh();
        } else {
            toast.error(result.error || 'Gagal memulihkan varian produk.');
        }
    };

    return (
        <TooltipProvider>
            <form
                role="search"
                onSubmit={handleSearch}
                className="flex min-w-0 flex-wrap items-center gap-3 border-b border-white/5 px-4 py-3"
            >
                <div className="relative w-full min-w-0 flex-1 sm:min-w-64 sm:max-w-sm">
                    <Search
                        aria-hidden="true"
                        className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <input
                        type="search"
                        name="q"
                        aria-label="Cari katalog produk"
                        placeholder="Cari nama produk, varian, atau SKU..."
                        defaultValue={query.search}
                        className="w-full rounded-lg border border-white/10 bg-muted/30 py-2 pr-3 pl-9 text-base transition-colors placeholder:text-muted-foreground/60 focus:border-primary/50 focus:ring-2 focus:ring-primary/30 focus:outline-none sm:text-sm"
                    />
                </div>
                <Button type="submit" variant="outline" size="sm">
                    Cari
                </Button>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    Baris per halaman
                    <select
                        aria-label="Baris per halaman"
                        value={pageSize}
                        onChange={(event) =>
                            router.push(
                                buildCatalogUrl({
                                    pageSize: Number(event.target.value),
                                    page: 1,
                                }),
                            )
                        }
                        className="rounded-md border border-white/10 bg-background px-2 py-1.5 text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
                    >
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                    </select>
                </label>
                <span className="text-xs text-muted-foreground" aria-live="polite">
                    Menampilkan {firstResult}–{lastResult} dari {total} varian
                </span>
            </form>

            {variants.length === 0 ? (
                <div className="flex min-h-[400px] flex-col items-center justify-center bg-muted/5 py-20 text-center text-muted-foreground">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted/20">
                        <Package className="h-6 w-6 text-muted-foreground/50" />
                    </div>
                    <p className="text-lg font-medium">
                        {productTableLabels.emptyTitle}
                    </p>
                    <p className="mx-auto mt-1 max-w-xs text-sm">
                        {productTableLabels.emptyDescription}
                    </p>
                </div>
            ) : (
                <ResponsiveTable
                    data-testid="product-catalog-scroll"
                    role="region"
                    aria-label="Tabel katalog produk; geser horizontal untuk melihat semua kolom dan aksi"
                    tabIndex={0}
                    minWidth={showPrices ? 1000 : 780}
                    stickyHeader
                    maxHeight="70vh"
                    className="mx-0 max-w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 [&_[data-slot=table-container]]:overflow-visible"
                >
                    <Table>
                        <TableCaption className="sr-only">
                            Daftar varian produk
                        </TableCaption>
                            <TableHeader className="bg-muted/30">
                                <TableRow className="hover:bg-transparent border-white/10 text-[11px] font-bold uppercase tracking-wider">
                                    <SortableTableHead
                                        className="pl-6"
                                        sortable
                                        direction={sortDirection('name')}
                                        onSort={() => handleSort('name')}
                                    >
                                        {productTableLabels.catalogItem}
                                    </SortableTableHead>
                                    <TableHead>
                                        {productTableLabels.skuCode}
                                    </TableHead>
                                    <TableHead>
                                        {productTableLabels.type}
                                    </TableHead>
                                    <TableHead>
                                        {productTableLabels.unit}
                                    </TableHead>
                                    <SortableTableHead
                                        className="text-right"
                                        sortable
                                        direction={sortDirection('stock')}
                                        onSort={() => handleSort('stock')}
                                    >
                                        <div className="flex items-center justify-end gap-1">
                                            <span>{productTableLabels.stockLevel}</span>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <button
                                                        type="button"
                                                        aria-label="Informasi stok"
                                                        className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                                                    >
                                                        <Info
                                                            aria-hidden="true"
                                                            className="h-3.5 w-3.5"
                                                        />
                                                    </button>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p className="max-w-xs text-xs">
                                                        {
                                                            productTableLabels.stockLevelTooltip
                                                        }
                                                    </p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </div>
                                    </SortableTableHead>
                                    {showPrices && (
                                        <>
                                            <SortableTableHead
                                                className="text-right whitespace-nowrap"
                                                sortable
                                                direction={sortDirection('currentCost')}
                                                onSort={() => handleSort('currentCost')}
                                            >
                                                <div className="flex items-center justify-end gap-1">
                                                    <span>{productTableLabels.currentCost}</span>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <button
                                                                type="button"
                                                                aria-label="Informasi biaya saat ini"
                                                                className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                                                            >
                                                                <Info
                                                                    aria-hidden="true"
                                                                    className="h-3.5 w-3.5"
                                                                />
                                                            </button>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p className="max-w-xs text-xs">
                                                                {
                                                                    productTableLabels.currentCostTooltip
                                                                }
                                                            </p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </div>
                                            </SortableTableHead>
                                            <SortableTableHead
                                                className="text-right whitespace-nowrap"
                                                sortable
                                                direction={sortDirection('standardCost')}
                                                onSort={() => handleSort('standardCost')}
                                            >
                                                <div className="flex items-center justify-end gap-1">
                                                    <span>{productTableLabels.standardCost}</span>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <button
                                                                type="button"
                                                                aria-label="Informasi biaya standar"
                                                                className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                                                            >
                                                                <Info
                                                                    aria-hidden="true"
                                                                    className="h-3.5 w-3.5"
                                                                />
                                                            </button>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p className="max-w-xs text-xs">
                                                                {
                                                                    productTableLabels.standardCostTooltip
                                                                }
                                                            </p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </div>
                                            </SortableTableHead>
                                            <SortableTableHead
                                                className="text-right whitespace-nowrap"
                                                sortable
                                                direction={sortDirection('buyPrice')}
                                                onSort={() => handleSort('buyPrice')}
                                            >
                                                {productTableLabels.buyPrice}
                                            </SortableTableHead>
                                            <SortableTableHead
                                                className="text-right whitespace-nowrap"
                                                sortable
                                                direction={sortDirection('price')}
                                                onSort={() => handleSort('price')}
                                            >
                                                {productTableLabels.catalog}
                                            </SortableTableHead>
                                        </>
                                    )}
                                    <TableHead className="text-right pr-6">
                                        {productTableLabels.actions}
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {variants.map((variant) => (
                                    <TableRow
                                        key={variant.id}
                                        className="group border-white/5 hover:bg-primary/[0.02] transition-colors"
                                    >
                                        <TableCell className="pl-6 py-4">
                                            <div className="flex flex-col">
                                                <Link
                                                    href={`/dashboard/products/${variant.productId}`}
                                                    className="font-bold text-sm tracking-tight text-foreground truncate max-w-[300px] hover:text-primary transition-colors"
                                                >
                                                    {variant.name ||
                                                        variant.productName}
                                                </Link>
                                                {variant.name &&
                                                    variant.name !==
                                                        variant.productName && (
                                                        <span className="text-[11px] text-muted-foreground font-medium">
                                                            {
                                                                variant.productName
                                                            }
                                                        </span>
                                                    )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded border border-white/5">
                                                {variant.skuCode}
                                            </span>
                                            {variant.archivedAt && (
                                                <Badge
                                                    variant="outline"
                                                    className="ml-2 text-[9px] font-bold py-0 h-5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                                                >
                                                    {
                                                        productTableLabels.archivedBadge
                                                    }
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant="outline"
                                                className={`text-[10px] font-bold py-0 h-5 border-transparent ${productTypeBadgeColors[variant.productType]}`}
                                            >
                                                {
                                                    productTypeBadgeLabels[
                                                        variant.productType
                                                    ]
                                                }
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-[11px] font-semibold text-muted-foreground">
                                                {formatUnitLabel(
                                                    variant.primaryUnit,
                                                )}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex flex-col items-end">
                                                <span
                                                    className={`text-sm font-bold tracking-tight ${variant.stock <= (Number(variant.minStockAlert) || 0) ? 'text-red-500' : 'text-foreground'}`}
                                                >
                                                    {variant.stock.toFixed(2)}
                                                </span>
                                                {variant.minStockAlert && (
                                                    <span className="text-[9px] text-muted-foreground uppercase tracking-tighter">
                                                        Min:{' '}
                                                        {Number(
                                                            variant.minStockAlert,
                                                        )}
                                                    </span>
                                                )}
                                            </div>
                                        </TableCell>
                                        {showPrices && (
                                            <>
                                                <TableCell className="text-right font-medium text-sm tabular-nums">
                                                    <div className="flex flex-col items-end">
                                                        <span
                                                            className={
                                                                variant.currentCost
                                                                    ? 'text-primary font-bold'
                                                                    : 'text-muted-foreground'
                                                            }
                                                        >
                                                            {variant.currentCost
                                                                ? formatRupiah(
                                                                      Number(
                                                                          variant.currentCost,
                                                                      ),
                                                                  )
                                                                : '-'}
                                                        </span>
                                                        {!variant.currentCost &&
                                                        variant.standardCost ? (
                                                            <span className="mt-1 text-[9px] text-muted-foreground">
                                                                Biaya standar
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right font-medium text-sm tabular-nums">
                                                    <div className="flex flex-col items-end">
                                                        <span
                                                            className={
                                                                variant.standardCost
                                                                    ? 'text-foreground font-bold'
                                                                    : 'text-muted-foreground'
                                                            }
                                                        >
                                                            {variant.standardCost
                                                                ? formatRupiah(
                                                                      Number(
                                                                          variant.standardCost,
                                                                      ),
                                                                  )
                                                                : '-'}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right font-medium text-sm tabular-nums">
                                                    <div className="flex flex-col items-end">
                                                        <span
                                                            className={
                                                                !variant.currentCost &&
                                                                variant.buyPrice
                                                                    ? 'text-foreground font-bold'
                                                                    : 'text-muted-foreground'
                                                            }
                                                        >
                                                            {variant.buyPrice
                                                                ? formatRupiah(
                                                                      Number(
                                                                          variant.buyPrice,
                                                                      ),
                                                                  )
                                                                : '-'}
                                                        </span>
                                                        {!variant.currentCost &&
                                                            variant.buyPrice && (
                                                                <Badge
                                                                    variant="outline"
                                                                    className="text-[8px] h-4 py-0 px-1 mt-1"
                                                                >
                                                                    BELI TERAKHIR
                                                                </Badge>
                                                            )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right font-medium text-xs tabular-nums">
                                                    <div className="flex flex-col items-end">
                                                        <span
                                                            className={
                                                                !variant.currentCost &&
                                                                !variant.buyPrice
                                                                    ? 'text-foreground font-bold'
                                                                    : 'text-muted-foreground'
                                                            }
                                                        >
                                                            {variant.price
                                                                ? formatRupiah(
                                                                      Number(
                                                                          variant.price,
                                                                      ),
                                                                  )
                                                                : '-'}
                                                        </span>
                                                        {!variant.currentCost &&
                                                            !variant.buyPrice &&
                                                            variant.price && (
                                                                <Badge
                                                                    variant="outline"
                                                                    className="text-[8px] h-4 py-0 px-1 mt-1"
                                                                >
                                                                    KATALOG
                                                                </Badge>
                                                            )}
                                                    </div>
                                                </TableCell>
                                            </>
                                        )}
                                        <TableCell className="text-right pr-6">
                                            <div className="flex justify-end gap-1 opacity-100 transition-opacity">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-11 w-11 transition-colors hover:bg-primary/10 hover:text-primary sm:h-8 sm:w-8"
                                                    aria-label={actionName(
                                                        'Edit',
                                                        variant,
                                                    )}
                                                    onClick={() =>
                                                        handleEditClick(
                                                            variant.productId,
                                                        )
                                                    }
                                                >
                                                    <Edit aria-hidden="true" className="h-4 w-4" />
                                                </Button>
                                                {variant.archivedAt ? (
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-11 w-11 transition-colors hover:bg-green-500/10 hover:text-green-600 sm:h-8 sm:w-8"
                                                                aria-label={actionName(
                                                                    'Pulihkan',
                                                                    variant,
                                                                )}
                                                                onClick={() =>
                                                                    handleUnarchive(
                                                                        variant,
                                                                    )
                                                                }
                                                            >
                                                                <ArchiveRestore
                                                                    aria-hidden="true"
                                                                    className="h-4 w-4"
                                                                />
                                                            </Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            {
                                                                productTableLabels.unarchiveSku
                                                            }
                                                        </TooltipContent>
                                                    </Tooltip>
                                                ) : (
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-11 w-11 transition-colors hover:bg-amber-500/10 hover:text-amber-600 sm:h-8 sm:w-8"
                                                                aria-label={actionName(
                                                                    'Arsipkan',
                                                                    variant,
                                                                )}
                                                                onClick={() =>
                                                                    handleArchiveClick(
                                                                        variant,
                                                                    )
                                                                }
                                                            >
                                                                <Archive
                                                                    aria-hidden="true"
                                                                    className="h-4 w-4"
                                                                />
                                                            </Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            {
                                                                productTableLabels.archiveSku
                                                            }
                                                        </TooltipContent>
                                                    </Tooltip>
                                                )}
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-11 w-11 transition-colors hover:bg-red-500/10 hover:text-red-500 sm:h-8 sm:w-8"
                                                    aria-label={actionName(
                                                        'Hapus',
                                                        variant,
                                                    )}
                                                    onClick={() =>
                                                        handleDeleteClick(
                                                            variant,
                                                        )
                                                    }
                                                >
                                                    <Trash2
                                                        aria-hidden="true"
                                                        className="h-4 w-4"
                                                    />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </ResponsiveTable>
            )}

            <div className="max-w-full overflow-x-auto border-t border-white/5 px-4 py-3">
                <DataTablePagination
                    pageIndex={page - 1}
                    pageCount={pageCount}
                    canPreviousPage={page > 1}
                    canNextPage={page < pageCount}
                    onFirstPage={() =>
                        router.push(buildCatalogUrl({ page: 1 }))
                    }
                    onPreviousPage={() =>
                        router.push(buildCatalogUrl({ page: page - 1 }))
                    }
                    onNextPage={() =>
                        router.push(buildCatalogUrl({ page: page + 1 }))
                    }
                    onLastPage={() =>
                        router.push(buildCatalogUrl({ page: pageCount }))
                    }
                />
            </div>

            {/* Delete Confirmation Dialog */}
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {productTableLabels.deleteDialogTitle}
                        </DialogTitle>
                        <DialogDescription>
                            {productTableLabels.deleteDialogDescription(
                                variantToDelete?.productName || '',
                                variantToDelete?.name !==
                                    variantToDelete?.productName
                                    ? variantToDelete?.name || ''
                                    : '',
                                variantToDelete?.skuCode || '',
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setDeleteDialogOpen(false)}
                            disabled={isDeleting}
                        >
                            {productTableLabels.deleteDialogCancel}
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDeleteConfirm}
                            disabled={isDeleting}
                        >
                            {isDeleting
                                ? productTableLabels.deleting
                                : productTableLabels.deleteSku}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Archive Confirmation Dialog */}
            <Dialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {productTableLabels.archiveDialogTitle}
                        </DialogTitle>
                        <DialogDescription className="whitespace-pre-line">
                            {productTableLabels.archiveDialogDescription(
                                variantToArchive?.productName || '',
                                variantToArchive?.name !==
                                    variantToArchive?.productName
                                    ? variantToArchive?.name || ''
                                    : '',
                                variantToArchive?.skuCode || '',
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setArchiveDialogOpen(false)}
                            disabled={isArchiving}
                        >
                            {productTableLabels.deleteDialogCancel}
                        </Button>
                        <Button
                            onClick={handleArchiveConfirm}
                            disabled={isArchiving}
                        >
                            {isArchiving
                                ? productTableLabels.archiving
                                : productTableLabels.archiveDialogConfirm}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </TooltipProvider>
    );
}
