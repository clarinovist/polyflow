import { Input } from '@/components/ui/input';
import { formatRupiah } from '@/lib/utils/utils';
import { formLabels } from '@/lib/labels';
import type { UseFormReturn } from 'react-hook-form';
import type { SalesOrderFormValues } from './types';
import type { computeOrderTotals } from '@/lib/utils/order-totals';

type DesktopOrderTotalsProps = {
    form: UseFormReturn<SalesOrderFormValues>;
    totals: ReturnType<typeof computeOrderTotals>;
    isShippingFromFleet: boolean;
    watchShippingCost: number;
};

export function DesktopOrderTotals({
    form,
    totals,
    isShippingFromFleet,
    watchShippingCost,
}: DesktopOrderTotalsProps) {
    return (
        <div className="hidden md:block w-full max-w-sm ml-auto border rounded-lg p-4 bg-muted/30 space-y-2">
            <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                    {formLabels.subtotal}
                </span>
                <span className="tabular-nums">
                    {formatRupiah(
                        totals.hasInclude ? totals.dpp : totals.gross,
                    )}
                </span>
            </div>
            <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Diskon</span>
                <span className="text-red-500 tabular-nums">
                    -{formatRupiah(totals.discount)}
                </span>
            </div>
            <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Pajak</span>
                <span className="tabular-nums">{formatRupiah(totals.tax)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Ongkos Kirim</span>
                {isShippingFromFleet ? (
                    <div className="text-right">
                        <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                            {formatRupiah(watchShippingCost)}
                        </span>
                        <p className="text-[10px] text-muted-foreground">
                            Dari surat jalan
                        </p>
                    </div>
                ) : (
                    <Input
                        type="number"
                        min={0}
                        {...form.register('shippingCost', {
                            valueAsNumber: true,
                        })}
                        className="w-32 text-right h-9"
                        placeholder="0"
                    />
                )}
            </div>
            <div className="flex justify-between items-center pt-2 border-t font-bold text-lg">
                <span>Total Keseluruhan</span>
                <span className="tabular-nums">
                    {formatRupiah(totals.net + watchShippingCost)}
                </span>
            </div>
        </div>
    );
}

type MobileOrderTotalsProps = {
    form: UseFormReturn<SalesOrderFormValues>;
    totals: ReturnType<typeof computeOrderTotals>;
    isShippingFromFleet: boolean;
    watchShippingCost: number;
};

export function MobileOrderTotals({
    form,
    totals,
    isShippingFromFleet,
    watchShippingCost,
}: MobileOrderTotalsProps) {
    return (
        <div className="border rounded-lg p-4 bg-muted/30 space-y-2">
            <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">
                    {formatRupiah(totals.gross)}
                </span>
            </div>
            <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Diskon</span>
                <span className="text-red-500 tabular-nums">
                    -{formatRupiah(totals.discount)}
                </span>
            </div>
            <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Pajak</span>
                <span className="tabular-nums">{formatRupiah(totals.tax)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Ongkos Kirim</span>
                {isShippingFromFleet ? (
                    <div className="text-right">
                        <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                            {formatRupiah(watchShippingCost)}
                        </span>
                        <p className="text-[10px] text-muted-foreground">
                            Dari surat jalan
                        </p>
                    </div>
                ) : (
                    <Input
                        type="number"
                        min={0}
                        {...form.register('shippingCost', {
                            valueAsNumber: true,
                        })}
                        className="w-28 text-right h-11"
                        placeholder="0"
                    />
                )}
            </div>
            <div className="flex justify-between items-center pt-2 border-t font-bold text-lg">
                <span>Total</span>
                <span className="tabular-nums">
                    {formatRupiah(totals.net + watchShippingCost)}
                </span>
            </div>
        </div>
    );
}
