import { Input } from '@/components/ui/input';
import {
    FormControl,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { formatRupiah } from '@/lib/utils/utils';
import {
    parseIndonesianPrice,
    formatIndonesianPrice,
} from '@/lib/utils/price-format';
import type { Dispatch, SetStateAction } from 'react';
import type { ControllerRenderProps } from 'react-hook-form';
import type { SalesOrderFormValues } from './types';

type MobileDiscountFieldProps = {
    index: number;
    displayValue: string;
    handleDiscountChange: (index: number, valStr: string) => void;
    rawDiscountInputs: Record<number, string>;
    discType: 'PERCENT' | 'NOMINAL';
    setRawDiscountInputs: Dispatch<SetStateAction<Record<number, string>>>;
    toggleDiscountType: (index: number) => void;
    afterDisc: number;
    sub: number;
    selectedCustomerCeiling: number | null;
    discField: ControllerRenderProps<
        SalesOrderFormValues,
        `items.${number}.discountPercent`
    >;
};

export function MobileDiscountField({
    index,
    displayValue,
    handleDiscountChange,
    rawDiscountInputs,
    discType,
    setRawDiscountInputs,
    toggleDiscountType,
    afterDisc,
    sub,
    selectedCustomerCeiling,
    discField,
}: MobileDiscountFieldProps) {
    return (
        <FormItem>
            <FormLabel className="text-xs text-muted-foreground flex justify-between items-center">
                <span>Diskon</span>
                <button
                    type="button"
                    onClick={() => toggleDiscountType(index)}
                    className="text-[10px] font-semibold text-primary border rounded px-1 hover:bg-muted transition-colors cursor-pointer"
                >
                    Tipe: {discType === 'PERCENT' ? '%' : 'Rp'}
                </button>
            </FormLabel>
            <FormControl>
                <div className="relative">
                    <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="0"
                        value={displayValue}
                        onChange={(e) =>
                            handleDiscountChange(index, e.target.value)
                        }
                        onBlur={() => {
                            const rawVal = rawDiscountInputs[index] || '';
                            if (rawVal) {
                                if (discType === 'NOMINAL') {
                                    const nominal =
                                        parseIndonesianPrice(rawVal);
                                    setRawDiscountInputs((prev) => ({
                                        ...prev,
                                        [index]: formatIndonesianPrice(nominal),
                                    }));
                                } else {
                                    const percent = Number(rawVal);
                                    setRawDiscountInputs((prev) => ({
                                        ...prev,
                                        [index]: String(percent),
                                    }));
                                }
                            } else {
                                setRawDiscountInputs((prev) => {
                                    const next = {
                                        ...prev,
                                    };
                                    delete next[index];
                                    return next;
                                });
                            }
                        }}
                        className="h-11 pr-8 text-right font-mono"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">
                        {discType === 'PERCENT' ? '%' : 'Rp'}
                    </span>
                </div>
            </FormControl>
            {afterDisc < sub && (
                <div className="text-[10px] font-mono text-red-500 text-right mt-1">
                    -{formatRupiah(sub - afterDisc)}
                </div>
            )}
            {selectedCustomerCeiling != null &&
                Number(discField.value || 0) > selectedCustomerCeiling && (
                    <div className="text-[10px] text-amber-600 leading-tight mt-1">
                        Melebihi plafon {selectedCustomerCeiling}% → PENDING
                    </div>
                )}
            <FormMessage />
        </FormItem>
    );
}
