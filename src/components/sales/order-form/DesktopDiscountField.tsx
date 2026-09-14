import { Input } from '@/components/ui/input';
import { formatRupiah } from '@/lib/utils/utils';
import {
    parseIndonesianPrice,
    formatIndonesianPrice,
} from '@/lib/utils/price-format';
import type { Dispatch, SetStateAction } from 'react';
import type { ControllerRenderProps } from 'react-hook-form';
import type { SalesOrderFormValues } from './types';

type DesktopDiscountFieldProps = {
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

export function DesktopDiscountField({
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
}: DesktopDiscountFieldProps) {
    return (
        <div className="flex flex-col items-end gap-1">
            <div className="relative w-full">
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
                                const nominal = parseIndonesianPrice(rawVal);
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
                    className="h-9 pl-2 pr-9 text-right font-mono text-sm"
                />
                <button
                    type="button"
                    onClick={() => toggleDiscountType(index)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold px-1 py-0.5 rounded border border-input hover:bg-muted bg-popover text-foreground transition-colors cursor-pointer select-none"
                    title="Klik untuk mengubah tipe diskon (% / Rp)"
                >
                    {discType === 'PERCENT' ? '%' : 'Rp'}
                </button>
            </div>
            {afterDisc < sub && (
                <span className="text-[10px] font-mono text-red-500 whitespace-nowrap">
                    -{formatRupiah(sub - afterDisc)}
                </span>
            )}
            {selectedCustomerCeiling != null &&
                Number(discField.value || 0) > selectedCustomerCeiling && (
                    <span className="text-[10px] text-amber-600 whitespace-normal max-w-[120px] leading-tight">
                        Melebihi plafon
                        {selectedCustomerCeiling}% — akan jadi PENDING
                    </span>
                )}
        </div>
    );
}
