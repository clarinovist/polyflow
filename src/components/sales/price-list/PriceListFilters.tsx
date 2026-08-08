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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
}: Props) {
    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm">Filter</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="grid gap-3 md:grid-cols-4">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Cari produk / SKU / customer"
                            value={search}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="pl-8"
                        />
                    </div>
                    <Select
                        value={customerFilter || '__all'}
                        onValueChange={(v) =>
                            onCustomerFilterChange(v === '__all' ? '' : v)
                        }
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Semua customer" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__all">
                                Semua customer
                            </SelectItem>
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
                        <SelectTrigger>
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
                        <SelectTrigger>
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
                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-4">
                        <span className="text-xs text-muted-foreground">
                            {totalLabel}
                        </span>
                        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                            <Checkbox
                                checked={onlyWithCustomPrice}
                                onCheckedChange={(v) =>
                                    onOnlyWithCustomPriceChange(v === true)
                                }
                            />
                            Hanya yang punya harga khusus
                        </label>
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={onRefresh}
                            disabled={loading}
                        >
                            {loading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                'Refresh'
                            )}
                        </Button>
                        <Button size="sm" onClick={onOpenBulkAdjust}>
                            <Settings2 className="mr-1.5 h-4 w-4" />
                            Sesuaikan Harga Massal
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
