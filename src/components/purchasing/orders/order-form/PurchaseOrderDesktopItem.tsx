import { Button } from '@/components/ui/button';
import {
    FormControl,
    FormField,
    FormItem,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { TableCell, TableRow } from '@/components/ui/table';
import { Trash2 } from 'lucide-react';
import { formatRupiah } from '@/lib/utils/utils';
import {
    parseIndonesianPrice,
    formatIndonesianPrice,
} from '@/lib/utils/price-format';
import { ProductCombobox } from '@/components/products/product-combobox';
import type { PurchaseOrderDesktopItemProps } from './types';
import { PurchaseOrderDesktopTax } from './PurchaseOrderDesktopTax';

export function PurchaseOrderDesktopItem({
    form,
    field,
    fields,
    index,
    productVariants,
    router,
    handleProductChange,
    rawQtyInputs,
    setRawQtyInputs,
    rawPriceInputs,
    setRawPriceInputs,
    taxableItems,
    setTaxableItems,
    remove,
    discountAmount,
    ppnResult,
    lineTotal,
    selectedVariant,
}: PurchaseOrderDesktopItemProps) {
    return (
        <TableRow key={field.id} className="align-top">
            <TableCell className="text-center pt-5 font-mono text-sm text-muted-foreground">
                {index + 1}
            </TableCell>

            {/* Produk */}
            <TableCell className="pt-3">
                <FormField
                    control={form.control}
                    name={`items.${index}.productVariantId`}
                    render={({ field: productField }) => (
                        <FormItem className="space-y-0">
                            <FormControl>
                                <ProductCombobox
                                    products={productVariants.map((v) => ({
                                        id: v.id,
                                        name: v.name,
                                        skuCode: v.skuCode,
                                        buyPrice: v.buyPrice,
                                    }))}
                                    value={productField.value}
                                    onValueChange={(val) => {
                                        productField.onChange(val);
                                        handleProductChange(index, val);
                                    }}
                                    placeholder="Pilih produk..."
                                    className="h-9 w-full justify-start border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 font-normal text-left truncate text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900"
                                    onCreateNew={() =>
                                        router.push(
                                            '/dashboard/products/create',
                                        )
                                    }
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                {selectedVariant && (
                    <div className="text-[11px] text-muted-foreground mt-1 px-1 flex items-center gap-1">
                        <span>{selectedVariant.skuCode}</span>
                        {(
                            selectedVariant as {
                                productType?: string;
                                assetCategory?: string;
                            }
                        ).productType === 'FIXED_ASSET' && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20">
                                Aset{' '}
                                {(
                                    selectedVariant as {
                                        assetCategory?: string;
                                    }
                                ).assetCategory
                                    ? `· ${(selectedVariant as { assetCategory?: string }).assetCategory}`
                                    : ''}
                            </span>
                        )}
                    </div>
                )}
            </TableCell>

            {/* Qty */}
            <TableCell className="px-2 pt-3">
                <FormField
                    control={form.control}
                    name={`items.${index}.quantity`}
                    render={({ field: qtyField }) => (
                        <FormItem className="space-y-0">
                            <FormControl>
                                <Input
                                    type="text"
                                    inputMode="decimal"
                                    className="h-9 w-full text-center font-mono text-sm px-2 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    value={
                                        rawQtyInputs[index] !== undefined
                                            ? rawQtyInputs[index]
                                            : (qtyField.value ?? '')
                                    }
                                    onChange={(e) => {
                                        setRawQtyInputs((prev) => ({
                                            ...prev,
                                            [index]: e.target.value,
                                        }));
                                        const num = Number(
                                            e.target.value.replace(',', '.'),
                                        );
                                        if (
                                            !isNaN(num) &&
                                            e.target.value !== ''
                                        ) {
                                            qtyField.onChange(num);
                                        }
                                    }}
                                    onBlur={() => {
                                        const raw = rawQtyInputs[index];
                                        const num = Number(
                                            (raw || '0').replace(',', '.'),
                                        );
                                        qtyField.onChange(isNaN(num) ? 0 : num);
                                        setRawQtyInputs((prev) => {
                                            const next = {
                                                ...prev,
                                            };
                                            delete next[index];
                                            return next;
                                        });
                                    }}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </TableCell>

            {/* Harga Satuan */}
            <TableCell className="pt-3">
                <FormField
                    control={form.control}
                    name={`items.${index}.unitPrice`}
                    render={({ field: priceField }) => (
                        <FormItem className="space-y-0">
                            <FormControl>
                                <div className="relative">
                                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                        Rp
                                    </span>
                                    <Input
                                        type="text"
                                        inputMode="decimal"
                                        value={
                                            rawPriceInputs[index] !== undefined
                                                ? rawPriceInputs[index]
                                                : formatIndonesianPrice(
                                                      priceField.value ?? 0,
                                                  )
                                        }
                                        onChange={(e) => {
                                            setRawPriceInputs((prev) => ({
                                                ...prev,
                                                [index]: e.target.value,
                                            }));
                                            const num = parseIndonesianPrice(
                                                e.target.value,
                                            );
                                            priceField.onChange(num);
                                        }}
                                        onBlur={() => {
                                            const num = parseIndonesianPrice(
                                                rawPriceInputs[index] || '0',
                                            );
                                            priceField.onChange(num);
                                            setRawPriceInputs((prev) => {
                                                const next = {
                                                    ...prev,
                                                };
                                                delete next[index];
                                                return next;
                                            });
                                        }}
                                        className="h-9 pl-7 text-right font-mono text-sm"
                                    />
                                </div>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </TableCell>

            {/* Diskon */}
            <TableCell className="px-2 pt-3">
                <FormField
                    control={form.control}
                    name={`items.${index}.discountPercent`}
                    render={({ field: discField }) => (
                        <div className="flex flex-col items-end gap-1">
                            <div className="relative w-full">
                                <Input
                                    type="number"
                                    min="0"
                                    max="100"
                                    placeholder="0"
                                    className="h-9 pl-2 pr-6 text-right font-mono text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    {...discField}
                                    onChange={(e) =>
                                        discField.onChange(
                                            Number(e.target.value),
                                        )
                                    }
                                />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                    %
                                </span>
                            </div>
                            {discountAmount > 0 && (
                                <span className="text-[10px] font-mono text-red-500 whitespace-nowrap">
                                    -{formatRupiah(discountAmount)}
                                </span>
                            )}
                        </div>
                    )}
                />
            </TableCell>

            {/* Pajak */}
            <PurchaseOrderDesktopTax
                form={form}
                index={index}
                taxableItems={taxableItems}
                setTaxableItems={setTaxableItems}
                ppnResult={ppnResult}
            />

            {/* Subtotal */}
            <TableCell className="pt-4 text-right font-bold font-mono text-sm text-foreground">
                {formatRupiah(lineTotal)}
            </TableCell>

            {/* Trash action */}
            <TableCell className="pt-2 text-center">
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                        remove(index);
                        setTaxableItems((prev) => {
                            const newMap: Record<number, boolean> = {};
                            Object.keys(prev)
                                .map(Number)
                                .sort((a, b) => a - b)
                                .filter((i) => i !== index)
                                .forEach((oldIdx, newIdx) => {
                                    newMap[newIdx] = prev[oldIdx];
                                });
                            return newMap;
                        });
                    }}
                    disabled={fields.length === 1}
                    className="h-8 w-8 text-muted-foreground hover:text-red-500 hover:bg-red-50"
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </TableCell>
        </TableRow>
    );
}
