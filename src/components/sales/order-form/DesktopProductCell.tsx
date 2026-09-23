import { Button } from '@/components/ui/button';
import { FormControl, FormField } from '@/components/ui/form';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { TableCell } from '@/components/ui/table';
import { cn, formatRupiah } from '@/lib/utils/utils';
import { Plus, Check, ChevronDown } from 'lucide-react';
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

type DesktopProductCellProps = {
    form: UseFormReturn<SalesOrderFormValues>;
    index: number;
    openProduct: Record<number, boolean>;
    setOpenProduct: Dispatch<SetStateAction<Record<number, boolean>>>;
    CUSTOM_ITEM_PREFIX: string;
    customItems: { tempId: string; name: string; sellPrice: number }[];
    filteredProducts: SerializedProductVariant[];
    productEmptyMessage: string;
    selectProduct: (index: number, variant: SerializedProductVariant) => void;
    toDisplayUnitPrice: (
        variant: SerializedProductVariant,
        baseUnitPrice: number,
    ) => number;
    getCustomerBasePrice: (variant: SerializedProductVariant) => number;
    getPriceSourceLabel: (variant: SerializedProductVariant) => string;
    setCustomItemIndex: Dispatch<SetStateAction<number | null>>;
    setQuickAddIndex: Dispatch<SetStateAction<number | null>>;
    variant: SerializedProductVariant | undefined;
};

export function DesktopProductCell({
    form,
    index,
    openProduct,
    setOpenProduct,
    CUSTOM_ITEM_PREFIX,
    customItems,
    filteredProducts,
    productEmptyMessage,
    selectProduct,
    toDisplayUnitPrice,
    getCustomerBasePrice,
    getPriceSourceLabel,
    setCustomItemIndex,
    setQuickAddIndex,
    variant,
}: DesktopProductCellProps) {
    return (
        <TableCell className="pt-3">
            <FormField
                control={form.control}
                name={`items.${index}.productVariantId`}
                render={({ field: productField, fieldState }) => (
                    <div className="flex flex-col gap-1">
                        <Popover
                            open={openProduct[index]}
                            onOpenChange={(open) =>
                                setOpenProduct((prev) => ({
                                    ...prev,
                                    [index]: open,
                                }))
                            }
                        >
                            <PopoverTrigger asChild>
                                <FormControl>
                                    <Button
                                        variant="outline"
                                        role="combobox"
                                        className={cn(
                                            'w-full justify-between h-9 px-3 font-normal text-left truncate',
                                            !productField.value &&
                                                'text-muted-foreground',
                                        )}
                                    >
                                        <div className="truncate text-left flex-1">
                                            {productField.value
                                                ? productField.value.startsWith(
                                                      CUSTOM_ITEM_PREFIX,
                                                  )
                                                    ? (() => {
                                                          const custom =
                                                              customItems.find(
                                                                  (c) =>
                                                                      c.tempId ===
                                                                      productField.value,
                                                              );
                                                          return custom
                                                              ? `✏️ ${custom.name}`
                                                              : 'Pilih Produk';
                                                      })()
                                                    : (() => {
                                                          const p =
                                                              filteredProducts.find(
                                                                  (p) =>
                                                                      p.id ===
                                                                      productField.value,
                                                              );
                                                          return p
                                                              ? p.product
                                                                    .name ===
                                                                p.name
                                                                  ? p.name
                                                                  : `${p.product.name} - ${p.name}`
                                                              : 'Pilih Produk';
                                                      })()
                                                : 'Pilih Produk'}
                                        </div>
                                        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </FormControl>
                            </PopoverTrigger>
                            <PopoverContent
                                className="w-[400px] p-0"
                                align="start"
                            >
                                <Command>
                                    <CommandInput placeholder="Cari produk..." />
                                    <CommandList>
                                        <CommandEmpty>
                                            {productEmptyMessage}
                                        </CommandEmpty>
                                        <CommandGroup>
                                            {filteredProducts.map(
                                                (
                                                    p: SerializedProductVariant,
                                                ) => (
                                                    <CommandItem
                                                        key={p.id}
                                                        value={`${p.product.name} ${p.name} ${p.skuCode}`.toLowerCase()}
                                                        onSelect={() => {
                                                            selectProduct(
                                                                index,
                                                                p,
                                                            );
                                                            setOpenProduct(
                                                                (prev) => ({
                                                                    ...prev,
                                                                    [index]: false,
                                                                }),
                                                            );
                                                        }}
                                                    >
                                                        <Check
                                                            className={cn(
                                                                'mr-2 h-4 w-4',
                                                                p.id ===
                                                                    productField.value
                                                                    ? 'opacity-100'
                                                                    : 'opacity-0',
                                                            )}
                                                        />
                                                        <div className="flex flex-col">
                                                            <span>
                                                                {p.product
                                                                    .name ===
                                                                p.name
                                                                    ? p.name
                                                                    : `${p.product.name} - ${p.name}`}
                                                            </span>
                                                            <span className="text-xs text-muted-foreground">
                                                                {p.skuCode} •{' '}
                                                                {formatRupiah(
                                                                    toDisplayUnitPrice(
                                                                        p,
                                                                        getCustomerBasePrice(
                                                                            p,
                                                                        ),
                                                                    ),
                                                                )}
                                                                /
                                                                {
                                                                    getProductionUnitMeta(
                                                                        p,
                                                                    )
                                                                        .displayUnit
                                                                }
                                                                {' · '}
                                                                {getPriceSourceLabel(
                                                                    p,
                                                                )}
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
                                                    setOpenProduct((prev) => ({
                                                        ...prev,
                                                        [index]: false,
                                                    }));
                                                    setCustomItemIndex(index);
                                                }}
                                                className="flex items-center gap-2 text-amber-600 cursor-pointer"
                                            >
                                                <span className="text-lg leading-none">
                                                    ✏️
                                                </span>
                                                <span className="font-medium">
                                                    Ketik Nama Produk Sendiri
                                                </span>
                                            </CommandItem>
                                            <CommandItem
                                                onSelect={() => {
                                                    setOpenProduct((prev) => ({
                                                        ...prev,
                                                        [index]: false,
                                                    }));
                                                    setQuickAddIndex(index);
                                                }}
                                                className="flex items-center gap-2 text-primary cursor-pointer"
                                            >
                                                <Plus className="h-4 w-4" />
                                                <span className="font-medium">
                                                    Tambah Produk Baru
                                                </span>
                                            </CommandItem>
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                        {fieldState.error && (
                            <span className="text-xs text-destructive whitespace-nowrap px-1">
                                {fieldState.error.message}
                            </span>
                        )}
                    </div>
                )}
            />
            {variant && (
                <div className="text-[11px] text-muted-foreground mt-1 px-1">
                    {variant.skuCode}
                </div>
            )}
        </TableCell>
    );
}
