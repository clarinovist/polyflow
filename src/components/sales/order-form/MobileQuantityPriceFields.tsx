import { Input } from '@/components/ui/input';
import {
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import type { getProductionUnitMeta } from '@/lib/utils/production-units';
import type { SerializedProductVariant } from '../sales-order-types';
import type { Dispatch, SetStateAction } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { SalesOrderFormValues } from './types';

type MobileQuantityPriceFieldsProps = {
    form: UseFormReturn<SalesOrderFormValues>;
    index: number;
    unitMeta: ReturnType<typeof getProductionUnitMeta> | null;
    rawQtyInputs: Record<number, string>;
    setRawQtyInputs: Dispatch<SetStateAction<Record<number, string>>>;
    variant: SerializedProductVariant | undefined;
    getPriceSourceLabel: (variant: SerializedProductVariant) => string;
};

export function MobileQuantityPriceFields({
    form,
    index,
    unitMeta,
    rawQtyInputs,
    setRawQtyInputs,
    variant,
    getPriceSourceLabel,
}: MobileQuantityPriceFieldsProps) {
    return (
        <div className="grid grid-cols-2 gap-3">
            <FormField
                control={form.control}
                name={`items.${index}.quantity`}
                render={({ field: qtyField }) => (
                    <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">
                            Qty
                            {unitMeta ? ` (${unitMeta.displayUnit})` : ''}
                        </FormLabel>
                        <FormControl>
                            <Input
                                type="text"
                                inputMode="decimal"
                                className="h-11"
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
                                    if (!isNaN(num) && e.target.value !== '') {
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
            <FormField
                control={form.control}
                name={`items.${index}.unitPrice`}
                render={({ field: priceField }) => (
                    <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">
                            Harga
                            {unitMeta ? ` /${unitMeta.displayUnit}` : ''}
                        </FormLabel>
                        <FormControl>
                            <Input
                                type="number"
                                step="100"
                                className="h-11"
                                {...priceField}
                            />
                        </FormControl>
                        {variant && (
                            <div className="text-[10px] text-muted-foreground text-right">
                                {getPriceSourceLabel(variant)}
                            </div>
                        )}
                        <FormMessage />
                    </FormItem>
                )}
            />
        </div>
    );
}
