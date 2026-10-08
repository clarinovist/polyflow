'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { DataTablePagination } from '@/components/ui/data-table-pagination';
import { ListToolbar } from '@/components/ui/list-toolbar';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { listPricesByProductAction } from '@/actions/sales/price-list';
import type { ProductType } from '@prisma/client';
import { PriceListFilters } from './PriceListFilters';
import { ProductPriceRow } from './ProductPriceRow';
import { BulkAdjustDialog } from './BulkAdjustDialog';

// ── Shared types (client-side, mirror serialized service output) ───────

export type CustomerOpt = { id: string; name: string; code: string | null };
export type ProductOpt = {
    id: string;
    name: string;
    skuCode: string;
    product: { name: string; productType: string };
};

type CustomerPriceEntry = {
    id: string;
    customerId: string;
    customerName: string;
    customerCode: string | null;
    unitPrice: number;
    deviationPercent: number | null;
    isActive: boolean;
    notes: string | null;
};

export type ProductPriceRowData = {
    variantId: string;
    skuCode: string;
    variantName: string;
    productName: string;
    productType: string;
    basePrice: number | null;
    customPriceCount: number;
    minPrice: number | null;
    maxPrice: number | null;
    prices: CustomerPriceEntry[];
};

export type PriceListResult = {
    data: ProductPriceRowData[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
};

// ── Shared helpers ───────────────────────────────────────────────────

export const PRODUCT_TYPE_OPTIONS: { value: string; label: string }[] = [
    { value: '', label: 'Semua kategori' },
    { value: 'FINISHED_GOOD', label: 'Finished Good' },
    { value: 'PACKAGING', label: 'Packaging' },
    { value: 'RAW_MATERIAL', label: 'Raw Material' },
];

export function productTypeLabel(productType: string): string {
    return (
        PRODUCT_TYPE_OPTIONS.find((o) => o.value === productType)?.label ||
        productType
    );
}

export function productLabel(p: {
    product: { name: string };
    name: string;
}): string {
    return p.product.name === p.name ? p.name : `${p.product.name} - ${p.name}`;
}

const PAGE_SIZE = 50;

export function PriceListClient({
    initialPrices,
    customers,
    products,
    priceError,
    customerOptionsError,
    productOptionsError,
    canManage,
}: {
    initialPrices: PriceListResult;
    customers: CustomerOpt[];
    products: ProductOpt[];
    priceError?: string;
    customerOptionsError?: string;
    productOptionsError?: string;
    canManage: boolean;
}) {
    const [prices, setPrices] = useState<PriceListResult>(initialPrices);
    const [search, setSearch] = useState('');
    const [customerFilter, setCustomerFilter] = useState('');
    const [productFilter, setProductFilter] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [onlyWithCustomPrice, setOnlyWithCustomPrice] = useState(false);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState(priceError);
    const [bulkOpen, setBulkOpen] = useState(false);

    const fetchPrices = useCallback(
        async (opts?: { page?: number }) => {
            setLoading(true);
            setLoadError(undefined);
            try {
                const result = await listPricesByProductAction({
                    search: search.trim() || undefined,
                    customerId: customerFilter || undefined,
                    productVariantId: productFilter || undefined,
                    category: (categoryFilter || undefined) as
                        | ProductType
                        | undefined,
                    onlyWithCustomPrice,
                    page: opts?.page ?? prices.page,
                    pageSize: PAGE_SIZE,
                });
                if (result.success && result.data) {
                    setPrices(result.data as unknown as PriceListResult);
                } else if (!result.success) {
                    const message = result.error || 'Gagal memuat price list';
                    setLoadError(message);
                    toast.error(message);
                }
            } catch {
                const message = 'Gagal memuat price list';
                setLoadError(message);
                toast.error(message);
            } finally {
                setLoading(false);
            }
        },
        [
            search,
            customerFilter,
            productFilter,
            categoryFilter,
            onlyWithCustomPrice,
            prices.page,
        ],
    );

    useEffect(() => {
        // Sync when filters change: reset to page 1, debounce search
        const t = setTimeout(() => {
            fetchPrices({ page: 1 });
        }, 300);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        search,
        customerFilter,
        productFilter,
        categoryFilter,
        onlyWithCustomPrice,
    ]);

    const totalLabel = useMemo(() => {
        return `${prices.total} SKU • halaman ${prices.page} dari ${prices.totalPages}`;
    }, [prices]);

    // Search mode: server already filters to matching SKUs, so auto-expand
    // rows to avoid hiding a matched customer name behind a chevron.
    const expandMode = search.trim() ? 'search' : 'browse';

    return (
        <div className="space-y-4">
            <ListToolbar
                filters={
                    <PriceListFilters
                        search={search}
                        onSearchChange={setSearch}
                        customerFilter={customerFilter}
                        onCustomerFilterChange={setCustomerFilter}
                        productFilter={productFilter}
                        onProductFilterChange={setProductFilter}
                        categoryFilter={categoryFilter}
                        onCategoryFilterChange={setCategoryFilter}
                        onlyWithCustomPrice={onlyWithCustomPrice}
                        onOnlyWithCustomPriceChange={setOnlyWithCustomPrice}
                        customers={customers}
                        products={products}
                        totalLabel={totalLabel}
                        loading={loading}
                        onRefresh={() => fetchPrices()}
                        onOpenBulkAdjust={() => setBulkOpen(true)}
                        canManage={canManage}
                    />
                }
            />

            {(customerOptionsError || productOptionsError) && (
                <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                    Sebagian opsi filter belum dapat dimuat. Daftar harga tetap
                    dapat digunakan, tetapi pilihan customer atau produk mungkin
                    tidak lengkap.
                </p>
            )}
            {loadError && (
                <div
                    role="alert"
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm"
                >
                    <div>
                        <p className="font-medium text-destructive">
                            Gagal memuat price list.
                        </p>
                        <p className="text-muted-foreground">
                            Data tidak dianggap kosong. Coba lagi tanpa mengubah
                            filter.
                        </p>
                    </div>
                    <Button
                        variant="outline"
                        className="min-h-11"
                        disabled={loading}
                        onClick={() => void fetchPrices()}
                    >
                        {loading ? 'Memuat…' : 'Coba lagi'}
                    </Button>
                </div>
            )}

            <Card>
                <CardContent className="p-0">
                    <ResponsiveTable
                        minWidth={760}
                        role="region"
                        aria-label="Tabel price list; geser horizontal untuk melihat seluruh perbandingan harga"
                        tabIndex={0}
                        className="mx-0 max-w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                        <Table className="text-foreground">
                            <caption className="sr-only">
                                Daftar harga produk per customer
                            </caption>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-8" />
                                    <TableHead>SKU</TableHead>
                                    <TableHead>Produk</TableHead>
                                    <TableHead>Kategori</TableHead>
                                    <TableHead className="text-right">
                                        Harga Dasar
                                    </TableHead>
                                    <TableHead>Harga Khusus</TableHead>
                                    <TableHead>Rentang</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {prices.data.length === 0 ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={7}
                                            className="h-24 text-center text-muted-foreground"
                                        >
                                            Tidak ada produk untuk filter ini.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    prices.data.map((row) => (
                                        <ProductPriceRow
                                            key={`${row.variantId}-${expandMode}`}
                                            row={row}
                                            customers={customers}
                                            canManage={canManage}
                                            defaultExpanded={
                                                expandMode === 'search'
                                            }
                                            onChanged={() => fetchPrices()}
                                        />
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </ResponsiveTable>
                    <div className="border-t p-3">
                        <DataTablePagination
                            pageIndex={Math.max(prices.page - 1, 0)}
                            pageCount={prices.totalPages}
                            canPreviousPage={prices.page > 1 && !loading}
                            canNextPage={
                                prices.page < prices.totalPages && !loading
                            }
                            onFirstPage={() => void fetchPrices({ page: 1 })}
                            onPreviousPage={() =>
                                void fetchPrices({ page: prices.page - 1 })
                            }
                            onNextPage={() =>
                                void fetchPrices({ page: prices.page + 1 })
                            }
                            onLastPage={() =>
                                void fetchPrices({ page: prices.totalPages })
                            }
                            rangeStart={
                                prices.total === 0
                                    ? 0
                                    : (prices.page - 1) * prices.pageSize + 1
                            }
                            rangeEnd={Math.min(
                                prices.page * prices.pageSize,
                                prices.total,
                            )}
                            totalCount={prices.total}
                        />
                    </div>
                </CardContent>
            </Card>

            {canManage && (
                <BulkAdjustDialog
                    open={bulkOpen}
                    onOpenChange={setBulkOpen}
                    customers={customers}
                    products={products}
                    onApplied={() => fetchPrices({ page: 1 })}
                />
            )}
        </div>
    );
}
