'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Search, Loader2, Settings2 } from 'lucide-react';
import {
    PRODUCT_TYPE_OPTIONS,
    productLabel,
    type CustomerOpt,
    type ProductOpt,
} from './PriceListClient';

type Props = {
    search: string;
    onSearchChange: (v: string) => void;
    customerFilter: string;
    onCustomerFilterChange: (v: string) => void;
    productFilter: string;
    onProductFilterChange: (v: string) => void;
    categoryFilter: string;
    onCategoryFilterChange: (v: string) => void;
    onlyWithCustomPrice: boolean;
    onOnlyWithCustomPriceChange: (v: boolean) => void;
    customers: CustomerOpt[];
    products: ProductOpt[];
    totalLabel: string;
    loading: boolean;
    onRefresh: () => void;
    onOpenBulkAdjust: () => void;
    canManage: boolean;
};

export function PriceListFilters({
    search,
    onSearchChange,
    customerFilter,
    onCustomerFilterChange,
    productFilter,
    onProductFilterChange,
    categoryFilter,
    onCategoryFilterChange,
    onlyWithCustomPrice,
    onOnlyWithCustomPriceChange,
    customers,
    products,
    totalLabel,
    loading,
    onRefresh,
    onOpenBulkAdjust,
    canManage,
}: Props) {
    return (
        <div className="min-w-0 flex-1 space-y-3">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="relative">
                    <Search
                        aria-hidden="true"
                        className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground"
                    />
                    <Input
                        type="search"
                        aria-label="Cari price list"
                        placeholder="Cari produk / SKU / customer"
                        value={search}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="h-11 pl-9"
                    />
                </div>
                <Select
                    value={customerFilter || '__all'}
                    onValueChange={(v) =>
                        onCustomerFilterChange(v === '__all' ? '' : v)
                    }
                >
                    <SelectTrigger
                        aria-label="Filter customer price list"
                        className="min-h-11 w-full"
                    >
                        <SelectValue placeholder="Semua customer" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="__all">Semua customer</SelectItem>
                        {customers.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                                {c.name} {c.code ? `(${c.code})` : ''}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select
                    value={productFilter || '__all'}
                    onValueChange={(v) =>
                        onProductFilterChange(v === '__all' ? '' : v)
                    }
                >
                    <SelectTrigger
                        aria-label="Filter produk price list"
                        className="min-h-11 w-full"
                    >
                        <SelectValue placeholder="Semua produk" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="__all">Semua produk</SelectItem>
                        {products.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                                {productLabel(p)} ({p.skuCode})
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select
                    value={categoryFilter || '__all'}
                    onValueChange={(v) =>
                        onCategoryFilterChange(v === '__all' ? '' : v)
                    }
                >
                    <SelectTrigger
                        aria-label="Filter kategori price list"
                        className="min-h-11 w-full"
                    >
                        <SelectValue placeholder="Kategori" />
                    </SelectTrigger>
                    <SelectContent>
                        {PRODUCT_TYPE_OPTIONS.map((o) => (
                            <SelectItem
                                key={o.value || '__all'}
                                value={o.value || '__all'}
                            >
                                {o.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-4">
                    <span
                        className="text-xs text-muted-foreground"
                        role="status"
                    >
                        {totalLabel}
                    </span>
                    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs">
                        <Checkbox
                            checked={onlyWithCustomPrice}
                            onCheckedChange={(v) =>
                                onOnlyWithCustomPriceChange(v === true)
                            }
                        />
                        Hanya yang punya harga khusus
                    </label>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button
                        variant="outline"
                        className="min-h-11"
                        onClick={onRefresh}
                        disabled={loading}
                    >
                        {loading ? (
                            <Loader2
                                aria-hidden="true"
                                className="h-4 w-4 motion-safe:animate-spin"
                            />
                        ) : null}
                        {loading ? 'Memuat…' : 'Muat ulang'}
                    </Button>
                    {canManage && (
                        <Button
                            className="min-h-11 max-w-full whitespace-normal"
                            onClick={onOpenBulkAdjust}
                        >
                            <Settings2
                                aria-hidden="true"
                                className="mr-1.5 h-4 w-4"
                            />
                            Sesuaikan Harga Massal
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
