import { Input } from '@/components/ui/input';
import { FormControl, FormField } from '@/components/ui/form';
import { TableCell } from '@/components/ui/table';
import type { getProductionUnitMeta } from '@/lib/utils/production-units';
import type { Dispatch, SetStateAction } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { SalesOrderFormValues } from './types';

type DesktopQuantityCellProps = {
    form: UseFormReturn<SalesOrderFormValues>;
    index: number;
    rawQtyInputs: Record<number, string>;
    setRawQtyInputs: Dispatch<SetStateAction<Record<number, string>>>;
    unitMeta: ReturnType<typeof getProductionUnitMeta> | null;
};

export function DesktopQuantityCell({
    form,
    index,
    rawQtyInputs,
    setRawQtyInputs,
    unitMeta,
}: DesktopQuantityCellProps) {
    return (
        <TableCell className="px-2 pt-3">
            <FormField
                control={form.control}
                name={`items.${index}.quantity`}
                render={({ field: qtyField }) => (
                    <div className="flex flex-col items-center">
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
                        {unitMeta && (
                            <span className="text-[10px] text-muted-foreground mt-1 font-medium whitespace-nowrap">
                                {unitMeta.displayUnit}
                            </span>
                        )}
                    </div>
                )}
            />
        </TableCell>
    );
}
