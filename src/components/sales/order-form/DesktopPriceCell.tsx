import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { FormControl, FormField } from '@/components/ui/form';
import { TableCell } from '@/components/ui/table';
import {
    parseIndonesianPrice,
    formatIndonesianPrice,
} from '@/lib/utils/price-format';
import type { SerializedProductVariant } from '../sales-order-types';
import type { Dispatch, SetStateAction } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { SalesOrderFormValues } from './types';

type DesktopPriceCellProps = {
    form: UseFormReturn<SalesOrderFormValues>;
    index: number;
    rawPriceInputs: Record<number, string>;
    setRawPriceInputs: Dispatch<SetStateAction<Record<number, string>>>;
    variant: SerializedProductVariant | undefined;
    getPriceSourceLabel: (variant: SerializedProductVariant) => string;
};

export function DesktopPriceCell({
    form,
    index,
    rawPriceInputs,
    setRawPriceInputs,
    variant,
    getPriceSourceLabel,
}: DesktopPriceCellProps) {
    return (
        <TableCell className="pt-3">
            <FormField
                control={form.control}
                name={`items.${index}.unitPrice`}
                render={({ field: priceField }) => (
                    <div className="flex flex-col">
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
                        {variant && (
                            <span className="mt-1 text-[10px] text-muted-foreground text-right block">
                                {getPriceSourceLabel(variant)}
                            </span>
                        )}
                        <div className="flex items-center justify-end gap-1.5 mt-1">
                            <Checkbox
                                id={`isFreeItem-${index}`}
                                checked={Boolean(
                                    form.watch('items')?.[index]?.isFreeItem,
                                )}
                                onCheckedChange={(checked) => {
                                    form.setValue(
                                        `items.${index}.isFreeItem`,
                                        Boolean(checked),
                                        {
                                            shouldDirty: true,
                                        },
                                    );
                                    if (checked) {
                                        form.setValue(
                                            `items.${index}.unitPrice`,
                                            0,
                                            {
                                                shouldDirty: true,
                                            },
                                        );
                                        setRawPriceInputs((prev) => ({
                                            ...prev,
                                            [index]: '0',
                                        }));
                                    }
                                }}
                            />
                            <label
                                htmlFor={`isFreeItem-${index}`}
                                className="text-[10px] text-muted-foreground cursor-pointer font-medium select-none whitespace-nowrap"
                            >
                                Sampel / Gratis
                            </label>
                        </div>
                    </div>
                )}
            />
        </TableCell>
    );
}
