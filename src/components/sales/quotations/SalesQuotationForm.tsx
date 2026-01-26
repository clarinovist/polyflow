'use client';

import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createSalesQuotationSchema, CreateSalesQuotationValues, UpdateSalesQuotationValues, updateSalesQuotationSchema } from '@/lib/schemas/quotation';
import { createQuotation, updateQuotation } from '@/actions/quotations';
import { Input } from '@/components/ui/input';


import { Button } from '@/components/ui/button';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { cn, formatRupiah } from '@/lib/utils';
import { CalendarIcon, Plus, Trash2, Loader2, Check } from 'lucide-react';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Customer, ProductVariant, Product } from '@prisma/client';

type SerializedCustomer = Omit<Customer, 'creditLimit' | 'discountPercent'> & {
    creditLimit: number | null;
    discountPercent: number | null;
};

// Helper type for client-side usage where Decimals are converted to numbers
type SerializedProductVariant = Omit<ProductVariant, 'price' | 'buyPrice' | 'sellPrice' | 'conversionFactor' | 'minStockAlert' | 'reorderPoint' | 'reorderQuantity'> & {
    price: number | null;
    buyPrice: number | null;
    sellPrice: number | null;
    conversionFactor: number;
    minStockAlert: number | null;
    reorderPoint: number | null;
    reorderQuantity: number | null;
    product: Product;
    inventories: {
        locationId: string;
        quantity: number;
    }[];
};

interface SalesQuotationFormProps {
    customers: SerializedCustomer[];
    products: SerializedProductVariant[];
    mode: 'create' | 'edit';
    initialData?: UpdateSalesQuotationValues & { id: string };
}

export function SalesQuotationForm({ customers, products, mode, initialData }: SalesQuotationFormProps) {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [openCustomer, setOpenCustomer] = useState(false);

    // Unified type to satisfy react-hook-form's need for a consistent generic standard
    type SalesQuotationFormValues = {
        id?: string;
        customerId?: string;
        quotationDate: Date;
        validUntil?: Date | null; // Allow null for UI but schema might expect optional/date
        notes?: string;
        items: {
            id?: string;
            productVariantId: string;
            quantity: number;
            unitPrice: number;
            discountPercent?: number;
            taxPercent?: number;
        }[];
    };

    const form = useForm<SalesQuotationFormValues>({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resolver: zodResolver(mode === 'create' ? createSalesQuotationSchema : updateSalesQuotationSchema) as any,
        defaultValues: initialData ? {
            ...initialData,
            validUntil: initialData.validUntil ? new Date(initialData.validUntil) : undefined, // Ensure date object
            quotationDate: new Date(initialData.quotationDate),
        } : {
            customerId: '',
            quotationDate: new Date(),
            notes: '',
            items: [{ productVariantId: '', quantity: 1, unitPrice: 0, discountPercent: 0, taxPercent: 0 }],
        }
    });

    // Calculate totals
    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: 'items'
    });

    const watchItems = useWatch({ control: form.control, name: 'items' });

    const totals = watchItems?.reduce((acc, item) => {
        const qty = item.quantity || 0;
        const price = item.unitPrice || 0;
        const subtotal = qty * price;
        const discount = subtotal * ((item.discountPercent || 0) / 100);
        const taxable = subtotal - discount;
        const tax = taxable * ((item.taxPercent || 0) / 100);

        acc.gross += subtotal;
        acc.discount += discount;
        acc.tax += tax;
        acc.net += (taxable + tax);
        return acc;
    }, { gross: 0, discount: 0, tax: 0, net: 0 }) || { gross: 0, discount: 0, tax: 0, net: 0 };

    async function onSubmit(data: SalesQuotationFormValues) {
        setIsSubmitting(true);
        try {
            // Handle validUntil undefined/null
            const payload = {
                ...data,
                validUntil: data.validUntil || undefined,
            };

            const result = mode === 'create'
                ? await createQuotation(payload as CreateSalesQuotationValues)
                : await updateQuotation({ ...payload, id: initialData!.id } as UpdateSalesQuotationValues);

            if (result.success) {
                toast.success(`Quotation ${mode === 'create' ? 'Created' : 'Updated'}`);
                router.push('/sales/quotations');
            } else {
                toast.error(result.error || "Failed to save quotation");
            }
        } catch (_error) {
            toast.error("An unexpected error occurred");
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

                {/* Header Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Customer */}
                    <FormField
                        control={form.control}
                        name="customerId"
                        render={({ field }) => (
                            <FormItem className="flex flex-col">
                                <FormLabel>Customer (Optional)</FormLabel>
                                <Popover open={openCustomer} onOpenChange={setOpenCustomer}>
                                    <PopoverTrigger asChild>
                                        <FormControl>
                                            <Button
                                                variant="outline"
                                                role="combobox"
                                                className={cn(
                                                    "w-full justify-between",
                                                    !field.value && "text-muted-foreground"
                                                )}
                                            >
                                                {field.value
                                                    ? customers.find((customer) => customer.id === field.value)?.name
                                                    : "Select customer OR leave empty for prospect"}
                                                <Check className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </FormControl>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                                        <Command>
                                            <CommandInput placeholder="Search customer..." />
                                            <CommandList>
                                                <CommandEmpty>No customer found.</CommandEmpty>
                                                <CommandGroup>
                                                    {customers.map((customer) => (
                                                        <CommandItem
                                                            key={customer.id}
                                                            value={customer.name}
                                                            onSelect={() => {
                                                                form.setValue("customerId", customer.id);
                                                                setOpenCustomer(false);
                                                            }}
                                                        >
                                                            <Check
                                                                className={cn(
                                                                    "mr-2 h-4 w-4",
                                                                    customer.id === field.value
                                                                        ? "opacity-100"
                                                                        : "opacity-0"
                                                                )}
                                                            />
                                                            {customer.name}
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    {/* Quotation Date */}
                    <FormField
                        control={form.control}
                        name="quotationDate"
                        render={({ field }) => (
                            <FormItem className="flex flex-col">
                                <FormLabel>Quotation Date</FormLabel>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <FormControl>
                                            <Button
                                                variant={"outline"}
                                                className={cn(
                                                    "w-full pl-3 text-left font-normal",
                                                    !field.value && "text-muted-foreground"
                                                )}
                                            >
                                                {field.value ? (
                                                    format(field.value, "PPP")
                                                ) : (
                                                    <span>Pick a date</span>
                                                )}
                                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                            </Button>
                                        </FormControl>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <Calendar
                                            mode="single"
                                            selected={field.value}
                                            onSelect={field.onChange}
                                            disabled={(date) => {
                                                const today = new Date();
                                                today.setHours(23, 59, 59, 999);
                                                return date > today || date < new Date("1900-01-01"); // Allow past dates? Sure.
                                            }}
                                            captionLayout="dropdown"
                                            fromYear={2000}
                                            toYear={new Date().getFullYear() + 1}
                                            initialFocus
                                        />
                                    </PopoverContent>
                                </Popover>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    {/* Valid Until */}
                    <FormField
                        control={form.control}
                        name="validUntil"
                        render={({ field }) => (
                            <FormItem className="flex flex-col">
                                <FormLabel>Valid Until</FormLabel>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <FormControl>
                                            <Button
                                                variant={"outline"}
                                                className={cn(
                                                    "w-full pl-3 text-left font-normal",
                                                    !field.value && "text-muted-foreground"
                                                )}
                                            >
                                                {field.value ? (
                                                    format(field.value, "PPP")
                                                ) : (
                                                    <span>Pick a date</span>
                                                )}
                                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                            </Button>
                                        </FormControl>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <Calendar
                                            mode="single"
                                            selected={field.value as Date}
                                            onSelect={field.onChange}
                                            disabled={(date) =>
                                                date < new Date("1900-01-01")
                                            }
                                            captionLayout="dropdown"
                                            fromYear={2000}
                                            toYear={new Date().getFullYear() + 5}
                                            initialFocus
                                        />
                                    </PopoverContent>
                                </Popover>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    {/* Notes */}
                    <FormField
                        control={form.control}
                        name="notes"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Notes</FormLabel>
                                <FormControl>
                                    <Input placeholder="Optional notes..." {...field} value={field.value || ''} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                </div>

                {/* Line Items */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold">Order Items</h3>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => append({ productVariantId: '', quantity: 1, unitPrice: 0, discountPercent: 0, taxPercent: 0 })}
                        >
                            <Plus className="mr-2 h-4 w-4" /> Add Item
                        </Button>
                    </div>

                    <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                                <tr className="border-b">
                                    <th className="h-10 px-4 text-left font-medium w-[300px]">Product</th>
                                    <th className="h-10 px-4 text-left font-medium w-[120px]">Qty</th>
                                    <th className="h-10 px-4 text-left font-medium w-[150px]">Unit Price</th>
                                    <th className="h-10 px-4 text-left font-medium w-[100px]">Disc %</th>
                                    <th className="h-10 px-4 text-left font-medium w-[100px]">Tax %</th>
                                    <th className="h-10 px-4 text-right font-medium w-[150px]">Subtotal</th>
                                    <th className="h-10 px-4 w-[50px]"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {fields.map((field, index) => (
                                    <tr key={field.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                                        <td className="p-2 align-middle">
                                            <FormField
                                                control={form.control}
                                                name={`items.${index}.productVariantId`}
                                                render={({ field, fieldState }) => (
                                                    <div className="flex items-center gap-2">
                                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                            <SelectTrigger className="border-0 shadow-none bg-transparent h-auto p-2 w-[300px]">
                                                                <div className="truncate text-left font-medium">
                                                                    <SelectValue placeholder="Select Product" />
                                                                </div>
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {products.map((p) => (
                                                                    <SelectItem key={p.id} value={p.id}>
                                                                        {p.product.name === p.name ? p.name : `${p.product.name} - ${p.name}`} ({p.skuCode})
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                        {fieldState.error && (
                                                            <span className="text-xs text-destructive whitespace-nowrap">{fieldState.error.message}</span>
                                                        )}
                                                    </div>
                                                )}
                                            />
                                        </td>
                                        <td className="p-2">
                                            <FormField
                                                control={form.control}
                                                name={`items.${index}.quantity`}
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormControl>
                                                            <Input
                                                                type="number"
                                                                step="0.01"
                                                                className="border-0 shadow-none bg-transparent h-auto p-2"
                                                                {...field}
                                                            />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        </td>
                                        <td className="p-2">
                                            <FormField
                                                control={form.control}
                                                name={`items.${index}.unitPrice`}
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormControl>
                                                            <Input
                                                                type="number"
                                                                step="100"
                                                                className="border-0 shadow-none bg-transparent h-auto p-2"
                                                                {...field}
                                                            />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        </td>
                                        <td className="p-2">
                                            <FormField
                                                control={form.control}
                                                name={`items.${index}.discountPercent`}
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormControl>
                                                            <Input
                                                                type="number"
                                                                min="0"
                                                                max="100"
                                                                step="1"
                                                                placeholder="0"
                                                                className="border-0 shadow-none bg-transparent h-auto p-2"
                                                                {...field}
                                                            />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        </td>
                                        <td className="p-2">
                                            <FormField
                                                control={form.control}
                                                name={`items.${index}.taxPercent`}
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormControl>
                                                            <Input
                                                                type="number"
                                                                min="0"
                                                                max="100"
                                                                step="1"
                                                                placeholder="0"
                                                                className="border-0 shadow-none bg-transparent h-auto p-2"
                                                                {...field}
                                                            />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        </td>
                                        <td className="p-4 text-right tabular-nums">
                                            {(() => {
                                                const qty = form.watch(`items.${index}.quantity`) || 0;
                                                const price = form.watch(`items.${index}.unitPrice`) || 0;
                                                const disc = form.watch(`items.${index}.discountPercent`) || 0;
                                                const tax = form.watch(`items.${index}.taxPercent`) || 0;

                                                const sub = qty * price;
                                                const afterDisc = sub - (sub * (disc / 100));
                                                const total = afterDisc + (afterDisc * (tax / 100));

                                                return formatRupiah(total);
                                            })()}
                                        </td>
                                        <td className="p-2 text-center">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8 text-muted-foreground hover:text-red-500"
                                                onClick={() => remove(index)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-muted/50 font-medium">
                                <tr>
                                    <td colSpan={5} className="px-4 py-2 text-right text-muted-foreground">Subtotal</td>
                                    <td className="px-4 py-2 text-right">{formatRupiah(totals.gross)}</td>
                                    <td></td>
                                </tr>
                                <tr>
                                    <td colSpan={5} className="px-4 py-2 text-right text-muted-foreground">Discount</td>
                                    <td className="px-4 py-2 text-right text-red-500">-{formatRupiah(totals.discount)}</td>
                                    <td></td>
                                </tr>
                                <tr>
                                    <td colSpan={5} className="px-4 py-2 text-right text-muted-foreground">Tax</td>
                                    <td className="px-4 py-2 text-right">{formatRupiah(totals.tax)}</td>
                                    <td></td>
                                </tr>
                                <tr className="border-t border-muted-foreground/20">
                                    <td colSpan={5} className="px-4 py-3 text-right text-lg font-bold">Total Amount</td>
                                    <td className="px-4 py-3 text-right text-lg font-bold">{formatRupiah(totals.net)}</td>
                                    <td></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>

                <div className="flex justify-end gap-4">
                    <Button variant="outline" type="button" onClick={() => router.back()}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {mode === 'create' ? 'Create Quotation' : 'Update Quotation'}
                    </Button>
                </div>
            </form>
        </Form>
    );
}
