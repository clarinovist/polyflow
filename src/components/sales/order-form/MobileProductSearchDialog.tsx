import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { cn, formatRupiah } from '@/lib/utils/utils';
import { Plus, Check } from 'lucide-react';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from '@/components/ui/command';
import { getProductionUnitMeta } from '@/lib/utils/production-units';
import type { SerializedProductVariant } from '../sales-order-types';
import type { Dispatch, SetStateAction } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { SalesOrderFormValues } from './types';

type MobileProductSearchDialogProps = {
    form: UseFormReturn<SalesOrderFormValues>;
    mobileProductSearch: { open: boolean; index: number };
    setMobileProductSearch: Dispatch<
        SetStateAction<{ open: boolean; index: number }>
    >;
    productEmptyMessage: string;
    filteredProducts: SerializedProductVariant[];
    selectProduct: (index: number, variant: SerializedProductVariant) => void;
    toDisplayUnitPrice: (
        variant: SerializedProductVariant,
        baseUnitPrice: number,
    ) => number;
    getCustomerBasePrice: (variant: SerializedProductVariant) => number;
    getPriceSourceLabel: (variant: SerializedProductVariant) => string;
    setCustomItemIndex: Dispatch<SetStateAction<number | null>>;
    setQuickAddIndex: Dispatch<SetStateAction<number | null>>;
};

export function MobileProductSearchDialog({
    form,
    mobileProductSearch,
    setMobileProductSearch,
    productEmptyMessage,
    filteredProducts,
    selectProduct,
    toDisplayUnitPrice,
    getCustomerBasePrice,
    getPriceSourceLabel,
    setCustomItemIndex,
    setQuickAddIndex,
}: MobileProductSearchDialogProps) {
    return (
        <Dialog
            open={mobileProductSearch.open}
            onOpenChange={(open) =>
                setMobileProductSearch((prev) => ({ ...prev, open }))
            }
        >
            <DialogContent className="p-0 max-w-none sm:max-w-lg h-[90vh] flex flex-col">
                <DialogHeader className="px-4 pt-4 pb-2">
                    <DialogTitle>Pilih Produk</DialogTitle>
                </DialogHeader>
                <Command className="flex-1 overflow-hidden">
                    <CommandInput placeholder="Cari nama, SKU, atau kode produk..." />
                    <CommandList className="flex-1 overflow-y-auto">
                        <CommandEmpty>{productEmptyMessage}</CommandEmpty>
                        <CommandGroup>
                            {filteredProducts.map(
                                (p: SerializedProductVariant) => (
                                    <CommandItem
                                        key={p.id}
                                        value={`${p.product.name} ${p.name} ${p.skuCode}`.toLowerCase()}
                                        onSelect={() => {
                                            selectProduct(
                                                mobileProductSearch.index,
                                                p,
                                            );
                                            setMobileProductSearch({
                                                open: false,
                                                index: 0,
                                            });
                                        }}
                                        className="py-3"
                                    >
                                        <Check
                                            className={cn(
                                                'mr-2 h-4 w-4',
                                                p.id ===
                                                    form.getValues(
                                                        `items.${mobileProductSearch.index}.productVariantId`,
                                                    )
                                                    ? 'opacity-100'
                                                    : 'opacity-0',
                                            )}
                                        />
                                        <div className="flex flex-col">
                                            <span className="font-medium">
                                                {p.product.name === p.name
                                                    ? p.name
                                                    : `${p.product.name} - ${p.name}`}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                {p.skuCode} •{' '}
                                                {formatRupiah(
                                                    toDisplayUnitPrice(
                                                        p,
                                                        getCustomerBasePrice(p),
                                                    ),
                                                )}
                                                /
                                                {
                                                    getProductionUnitMeta(p)
                                                        .displayUnit
                                                }
                                                {' · '}
                                                {getPriceSourceLabel(p)}
                                            </span>
                                        </div>
                                    </CommandItem>
                                ),
                            )}
                        </CommandGroup>
                        <CommandSeparator />
                        <CommandGroup>
                            <CommandItem
                                onSelect={() => {
                                    const idx = mobileProductSearch.index;
                                    setMobileProductSearch({
                                        open: false,
                                        index: 0,
                                    });
                                    setCustomItemIndex(idx);
                                }}
                                className="flex items-center gap-2 text-amber-600 cursor-pointer py-3"
                            >
                                <span className="text-lg leading-none">✏️</span>
                                <span className="font-medium">
                                    Ketik Nama Produk Sendiri
                                </span>
                            </CommandItem>
                            <CommandItem
                                onSelect={() => {
                                    const idx = mobileProductSearch.index;
                                    setMobileProductSearch({
                                        open: false,
                                        index: 0,
                                    });
                                    setQuickAddIndex(idx);
                                }}
                                className="flex items-center gap-2 text-primary cursor-pointer py-3"
                            >
                                <Plus className="h-4 w-4" />
                                <span className="font-medium">
                                    Tambah Produk Baru
                                </span>
                            </CommandItem>
                        </CommandGroup>
                    </CommandList>
                </Command>
            </DialogContent>
        </Dialog>
    );
}
