import { Button } from '@/components/ui/button';
import {
    FormControl,
    FormField,
    FormItem,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Trash2 } from 'lucide-react';
import { formatRupiah } from '@/lib/utils/utils';
import {
    parseIndonesianPrice,
    formatIndonesianPrice,
} from '@/lib/utils/price-format';
import { ProductCombobox } from '@/components/products/product-combobox';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import type { PurchaseOrderItemViewProps } from './types';

export function PurchaseOrderMobileItem({
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
}: PurchaseOrderItemViewProps) {
    return (
        <div
            key={field.id}
            className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900/50 overflow-hidden"
        >
            {/* Header: Product + Qty + Delete */}
            <div className="flex items-center gap-3 p-4 pb-3">
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
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
                                        className="h-9 border-0 bg-transparent shadow-none p-0 hover:bg-transparent font-medium text-foreground w-full justify-start"
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
                </div>
                <FormField
                    control={form.control}
                    name={`items.${index}.quantity`}
                    render={({ field: qtyField }) => (
                        <FormItem className="space-y-0">
                            <FormControl>
                                <Input
                                    type="text"
                                    inputMode="decimal"
                                    className="h-9 w-28 text-center font-mono text-sm no-stepper"
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
                        </FormItem>
                    )}
                />
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
                    className="h-8 w-8 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 flex-shrink-0"
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>

            {/* Body: Price fields */}
            <div className="px-4 pb-3 space-y-2">
                {/* Harga Satuan */}
                <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground w-28">
                        Harga Satuan
                    </span>
                    <FormField
                        control={form.control}
                        name={`items.${index}.unitPrice`}
                        render={({ field: priceField }) => (
                            <FormItem className="space-y-0 flex-1 max-w-[200px]">
                                <FormControl>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                            Rp
                                        </span>
                                        <Input
                                            type="text"
                                            inputMode="decimal"
                                            value={
                                                rawPriceInputs[index] !==
                                                undefined
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
                                                const num =
                                                    parseIndonesianPrice(
                                                        e.target.value,
                                                    );
                                                priceField.onChange(num);
                                            }}
                                            onBlur={() => {
                                                const num =
                                                    parseIndonesianPrice(
                                                        rawPriceInputs[index] ||
                                                            '0',
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
                                            className="h-8 pl-8 text-right font-mono text-sm"
                                        />
                                    </div>
                                </FormControl>
                            </FormItem>
                        )}
                    />
                </div>

                {/* Diskon */}
                <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground w-28">
                        Diskon
                    </span>
                    <div className="flex items-center gap-2 flex-1 max-w-[200px]">
                        <FormField
                            control={form.control}
                            name={`items.${index}.discountPercent`}
                            render={({ field: discField }) => (
                                <FormItem className="space-y-0 w-20">
                                    <FormControl>
                                        <Input
                                            type="number"
                                            {...discField}
                                            onChange={(e) =>
                                                discField.onChange(
                                                    Number(e.target.value),
                                                )
                                            }
                                            className="h-8 text-center font-mono text-sm"
                                            min={0}
                                            max={100}
                                            placeholder="0"
                                        />
                                    </FormControl>
                                </FormItem>
                            )}
                        />
                        <span className="text-xs text-muted-foreground">%</span>
                        <span className="text-xs font-mono text-red-500 ml-auto">
                            {discountAmount > 0
                                ? `-${formatRupiah(discountAmount)}`
                                : 'Rp 0'}
                        </span>
                    </div>
                </div>

                {/* Kena Pajak toggle */}
                <div className="flex items-center gap-3">
                    <Checkbox
                        id={`taxable-${index}`}
                        checked={taxableItems[index] ?? false}
                        onCheckedChange={(checked) => {
                            setTaxableItems((prev) => ({
                                ...prev,
                                [index]: !!checked,
                            }));
                            if (!checked) {
                                form.setValue(`items.${index}.taxPercent`, 0);
                                form.setValue(
                                    `items.${index}.dppOtherAmount`,
                                    null,
                                );
                            }
                        }}
                    />
                    <label
                        htmlFor={`taxable-${index}`}
                        className="text-xs text-muted-foreground cursor-pointer select-none"
                    >
                        Kena Pajak
                    </label>
                </div>

                {/* PPN Mode — only when Kena Pajak checked */}
                {(taxableItems[index] ?? false) && (
                    <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-28">
                            Mode PPN
                        </span>
                        <FormField
                            control={form.control}
                            name={`items.${index}.ppnMode`}
                            render={({ field: ppnField }) => (
                                <FormItem className="space-y-0 flex-1">
                                    <FormControl>
                                        <RadioGroup
                                            value={ppnField.value || 'EXCLUDE'}
                                            onValueChange={ppnField.onChange}
                                            className="flex gap-4"
                                        >
                                            <div className="flex items-center gap-2">
                                                <RadioGroupItem
                                                    value="EXCLUDE"
                                                    id={`ppn-exclude-${index}`}
                                                />
                                                <Label
                                                    htmlFor={`ppn-exclude-${index}`}
                                                    className="text-xs cursor-pointer"
                                                >
                                                    Exclude (harga + pajak)
                                                </Label>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <RadioGroupItem
                                                    value="INCLUDE"
                                                    id={`ppn-include-${index}`}
                                                />
                                                <Label
                                                    htmlFor={`ppn-include-${index}`}
                                                    className="text-xs cursor-pointer"
                                                >
                                                    Include (harga termasuk)
                                                </Label>
                                            </div>
                                        </RadioGroup>
                                    </FormControl>
                                </FormItem>
                            )}
                        />
                    </div>
                )}

                {/* Pajak — only when Kena Pajak checked */}
                {(taxableItems[index] ?? false) && (
                    <>
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-xs text-muted-foreground w-28">
                                Pajak
                            </span>
                            <div className="flex items-center gap-2 flex-1 max-w-[200px]">
                                <FormField
                                    control={form.control}
                                    name={`items.${index}.taxPercent`}
                                    render={({ field: taxField }) => (
                                        <FormItem className="space-y-0 w-20">
                                            <FormControl>
                                                <Input
                                                    type="number"
                                                    {...taxField}
                                                    onChange={(e) =>
                                                        taxField.onChange(
                                                            Number(
                                                                e.target.value,
                                                            ),
                                                        )
                                                    }
                                                    className="h-8 text-center font-mono text-sm"
                                                    min={0}
                                                    max={100}
                                                    placeholder="0"
                                                />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                                <span className="text-xs text-muted-foreground">
                                    %
                                </span>
                                <span className="text-xs font-mono text-muted-foreground ml-auto">
                                    {ppnResult.taxAmount > 0
                                        ? formatRupiah(ppnResult.taxAmount)
                                        : 'Rp 0'}
                                </span>
                            </div>
                        </div>

                        {/* DPP */}
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-xs text-muted-foreground w-28">
                                DPP
                            </span>
                            <div className="flex items-center gap-2 flex-1 max-w-[200px]">
                                <FormField
                                    control={form.control}
                                    name={`items.${index}.dppOtherAmount`}
                                    render={({ field: dppField }) => (
                                        <FormItem className="space-y-0 flex-1">
                                            <FormControl>
                                                <div className="relative">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                                        Rp
                                                    </span>
                                                    <Input
                                                        type="text"
                                                        inputMode="decimal"
                                                        value={
                                                            dppField.value ?? ''
                                                        }
                                                        onChange={(e) => {
                                                            const normalized =
                                                                e.target.value.replace(
                                                                    ',',
                                                                    '.',
                                                                );
                                                            const num =
                                                                Number(
                                                                    normalized,
                                                                );
                                                            dppField.onChange(
                                                                e.target
                                                                    .value ===
                                                                    ''
                                                                    ? null
                                                                    : isNaN(num)
                                                                      ? 0
                                                                      : num,
                                                            );
                                                        }}
                                                        className="h-8 pl-8 text-right font-mono text-sm bg-zinc-50 dark:bg-zinc-900"
                                                        placeholder="Auto (11/12)"
                                                    />
                                                </div>
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Footer: Total */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/50 border-t">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Total
                </span>
                <span className="text-sm font-bold font-mono">
                    {formatRupiah(lineTotal)}
                </span>
            </div>
        </div>
    );
}
