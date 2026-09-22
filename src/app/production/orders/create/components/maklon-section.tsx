'use client';

import {
    FormField,
    FormItem,
    FormControl,
    FormLabel,
    FormDescription,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { CustomerCombobox } from '@/components/customers/CustomerCombobox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { InfoHint } from '@/components/common/InfoHint';
import { Factory } from 'lucide-react';
import { UseFormReturn, FieldValues } from 'react-hook-form';

interface Customer {
    id: string;
    name: string;
}

interface MaklonSectionProps {
    form: UseFormReturn<FieldValues>;
    isMaklon: boolean;
    onMaklonChange: (checked: boolean) => void;
    customers: Customer[];
}

export function MaklonSection({
    form,
    isMaklon,
    onMaklonChange,
    customers,
}: MaklonSectionProps) {
    return (
        <div className="pt-4 border-t space-y-4">
            <div className="flex items-center justify-between p-3 bg-blue-50/50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800/50">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-md">
                        <Factory className="h-4 w-4 text-blue-700 dark:text-blue-400" />
                    </div>
                    <div>
                        <Label
                            htmlFor="is-maklon"
                            className="font-bold text-sm text-blue-900 dark:text-blue-400 leading-none"
                        >
                            Order Maklon
                        </Label>
                        <InfoHint label="Info order maklon">
                            Gunakan jika pelanggan menyuplai bahan dan perusahaan
                            mengenakan biaya jasa konversi. Konsumsi material
                            dicatat dari lokasi maklon stage.
                        </InfoHint>
                    </div>
                </div>
                <Switch
                    id="is-maklon"
                    checked={isMaklon}
                    onCheckedChange={onMaklonChange}
                />
            </div>

            {isMaklon && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-1 duration-200">
                    <FormField
                        control={form.control}
                        name="maklonCustomerId"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Customer Maklon</FormLabel>
                                <FormControl>
                                    <CustomerCombobox
                                        customers={customers}
                                        value={(field.value as string) || ''}
                                        onChange={field.onChange}
                                    />
                                </FormControl>
                                <FormDescription>
                                    Pemilik bahan yang dipakai.
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="estimatedConversionCost"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>
                                    Estimasi Jasa Konversi (Rp)
                                </FormLabel>
                                <FormControl>
                                    <div className="relative">
                                        <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">
                                            Rp
                                        </span>
                                        <Input
                                            type="number"
                                            className="pl-9"
                                            {...field}
                                        />
                                    </div>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
            )}
        </div>
    );
}
