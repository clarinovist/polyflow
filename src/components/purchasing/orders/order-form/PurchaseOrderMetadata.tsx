import {
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { SupplierCombobox } from '@/components/purchasing/suppliers/supplier-combobox';
import { purchasingLabels } from '@/lib/labels';
import type { PurchaseOrderMetadataProps } from './types';

export function PurchaseOrderMetadata({
    form,
    suppliers,
    selectedSupplier,
}: PurchaseOrderMetadataProps) {
    return (
        <>
            <FormField
                control={form.control}
                name="supplierId"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Pilih Supplier</FormLabel>
                        <FormControl>
                            <SupplierCombobox
                                suppliers={suppliers}
                                value={field.value}
                                onValueChange={field.onChange}
                            />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />

            {/* Tempo (Payment Terms) — read-only from supplier */}
            {selectedSupplier?.paymentTermDays != null && (
                <div className="flex items-center justify-between px-3 py-2 bg-zinc-50 dark:bg-zinc-900 rounded-md border">
                    <span className="text-sm text-muted-foreground">Tempo</span>
                    <span className="text-sm font-semibold">
                        {selectedSupplier.paymentTermDays}{' '}
                        Hari
                    </span>
                </div>
            )}

            <div className="grid grid-cols-2 gap-4">
                <FormField
                    control={form.control}
                    name="orderDate"
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel>{purchasingLabels.poDate}</FormLabel>
                            <Input
                                type="date"
                                value={
                                    field.value
                                        ? new Date(field.value)
                                              .toISOString()
                                              .split('T')[0]
                                        : ''
                                }
                                onChange={(e) =>
                                    field.onChange(new Date(e.target.value))
                                }
                                className="h-10"
                            />
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="expectedDate"
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel>Estimasi Pengiriman</FormLabel>
                            <Input
                                type="date"
                                value={
                                    field.value
                                        ? new Date(field.value)
                                              .toISOString()
                                              .split('T')[0]
                                        : ''
                                }
                                onChange={(e) =>
                                    field.onChange(new Date(e.target.value))
                                }
                                className="h-10"
                            />
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>

            {/* Dikirim Ke (Delivery Address) */}
            <FormField
                control={form.control}
                name="deliveryAddress"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Dikirim Ke</FormLabel>
                        <FormControl>
                            <Input
                                {...field}
                                value={field.value ?? ''}
                                placeholder="Alamat pengiriman barang..."
                                className="h-10"
                            />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />
        </>
    );
}
