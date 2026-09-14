import { Button } from '@/components/ui/button';
import {
    FormControl,
    FormField,
    FormItem,
    FormLabel,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Calculator } from 'lucide-react';
import { formatRupiah } from '@/lib/utils/utils';
import type { PurchaseOrderSummaryProps } from './types';
import { PurchaseOrderMetadata } from './PurchaseOrderMetadata';

export function PurchaseOrderSummary({
    form,
    totals,
    grandTotal,
    suppliers,
    selectedSupplier,
    isLoading,
    mode,
}: PurchaseOrderSummaryProps) {
    return (
        <Card className="sticky top-6 border-zinc-200 dark:border-zinc-700/50 shadow-lg overflow-hidden">
            <div className="bg-zinc-900 dark:bg-zinc-800 text-white p-6">
                <div className="flex items-center gap-2 text-zinc-400 dark:text-zinc-300 text-xs uppercase tracking-widest font-bold mb-4">
                    <Calculator className="h-3 w-3" /> Estimasi Total
                </div>
                <div className="text-3xl font-bold font-mono tracking-tight">
                    {formatRupiah(grandTotal)}
                </div>
            </div>

            <CardContent className="p-6 space-y-4">
                {/* Breakdown */}
                <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-muted-foreground">
                        <span>Subtotal</span>
                        <span className="font-mono">
                            {formatRupiah(
                                totals.hasInclude ? totals.dpp : totals.gross,
                            )}
                        </span>
                    </div>
                    {totals.discount > 0 && (
                        <div className="flex justify-between text-red-500">
                            <span>Diskon</span>
                            <span className="font-mono">
                                -{formatRupiah(totals.discount)}
                            </span>
                        </div>
                    )}
                    {totals.tax > 0 && (
                        <div className="flex justify-between text-muted-foreground">
                            <span>Pajak</span>
                            <span className="font-mono">
                                {formatRupiah(totals.tax)}
                            </span>
                        </div>
                    )}
                    <FormField
                        control={form.control}
                        name="shippingCost"
                        render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between gap-2">
                                <FormLabel className="text-muted-foreground whitespace-nowrap">
                                    Ongkir
                                </FormLabel>
                                <FormControl>
                                    <Input
                                        type="text"
                                        inputMode="decimal"
                                        value={field.value ?? ''}
                                        onChange={(e) => {
                                            const normalized =
                                                e.target.value.replace(
                                                    ',',
                                                    '.',
                                                );
                                            const num = Number(normalized);
                                            field.onChange(
                                                isNaN(num) ? 0 : num,
                                            );
                                        }}
                                        className="h-8 w-32 text-right font-mono text-sm"
                                        min={0}
                                        placeholder="0"
                                    />
                                </FormControl>
                            </FormItem>
                        )}
                    />
                    <div className="flex justify-between font-bold pt-3 border-t border-zinc-200 dark:border-zinc-700">
                        <span>Total</span>
                        <span className="font-mono">
                            {formatRupiah(grandTotal)}
                        </span>
                    </div>
                </div>

                <PurchaseOrderMetadata
                    form={form}
                    suppliers={suppliers}
                    selectedSupplier={selectedSupplier}
                />

                <div className="pt-4 border-t">
                    <Button
                        type="submit"
                        className="w-full h-12 text-base font-semibold shadow-md bg-emerald-600 hover:bg-emerald-700 text-white"
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <span className="flex items-center gap-2">
                                <span className="h-4 w-4 border-2 border-white/30 border-t-white animate-spin rounded-full" />
                                {mode === 'edit'
                                    ? 'Menyimpan...'
                                    : 'Membuat...'}
                            </span>
                        ) : mode === 'edit' ? (
                            'Simpan Perubahan'
                        ) : (
                            'Konfirmasi Purchase Order'
                        )}
                    </Button>
                    <p className="text-center text-xs text-muted-foreground mt-3">
                        {mode === 'edit'
                            ? 'Perubahan akan memperbarui total dan jurnal.'
                            : 'Membuat pesanan draft. Persetujuan mungkin diperlukan.'}
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}
