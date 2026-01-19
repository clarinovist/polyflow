'use client';

import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createSalesOrderSchema, CreateSalesOrderValues, UpdateSalesOrderValues, updateSalesOrderSchema } from '@/lib/schemas/sales';
import { createSalesOrder, updateSalesOrder } from '@/actions/sales';
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
import { Customer, Location, ProductVariant, Product, SalesOrderType } from '@prisma/client';

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

interface SalesOrderFormProps {
    customers: SerializedCustomer[];
    locations: Location[];
    products: SerializedProductVariant[];
    mode: 'create' | 'edit';
    initialData?: UpdateSalesOrderValues & { id: string }; // Changed to UpdateSalesOrderValues
}

export function SalesOrderForm({ customers, locations, products, mode, initialData }: SalesOrderFormProps) {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [openCustomer, setOpenCustomer] = useState(false);

    // Filter locations for MTS constraint (Finished Good & Scrap only)
    const validLocations = locations.filter(l =>
        l.slug?.includes('finished') || l.slug?.includes('scrap') ||
        l.name.toLowerCase().includes('finished') || l.name.toLowerCase().includes('scrap')
    );

    // Unified type to satisfy react-hook-form's need for a consistent generic standard
    type SalesOrderFormValues = {
        id?: string;
        customerId?: string;
        sourceLocationId: string;
        orderDate: Date;
        expectedDate?: Date | null;
        orderType?: SalesOrderType; // Optional in form state logic, handled by schema defaults
        notes?: string;
        items: {
            id?: string;
            productVariantId: string;
            quantity: number;
            unitPrice: number;
        }[];
    };

    const form = useForm<SalesOrderFormValues>({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resolver: zodResolver(mode === 'create' ? createSalesOrderSchema : updateSalesOrderSchema) as any,
        defaultValues: initialData ? {
            ...initialData,
            orderType: (initialData as Record<string, unknown>).orderType as SalesOrderType || 'MAKE_TO_STOCK', // Ensure orderType exists for form state
        } : {
            customerId: '',
            sourceLocationId: '',
            orderDate: new Date(),
            notes: '',
            items: [{ productVariantId: '', quantity: 1, unitPrice: 0 }],
            orderType: 'MAKE_TO_STOCK' as SalesOrderType
        }
    });

    // Filter products based on selected source location
    const selectedLocationId = useWatch({ control: form.control, name: 'sourceLocationId' });
    const selectedOrderType = useWatch({ control: form.control, name: 'orderType' });

    const filteredProducts = products.filter(p => {
        if (!selectedLocationId) return true; // Show all if no location selected (or maybe show none?)
        // Check if product has inventory in the selected location
        // We show all items "registered" in this location, even if quantity is 0
        const inventory = p.inventories?.find(i => i.locationId === selectedLocationId);
        return !!inventory;
    });

    // Clear customerId if Order Type is MTS
    /* useEffect(() => {
         if (selectedOrderType === 'MAKE_TO_STOCK') {
             form.setValue('customerId', '');
         }
     }, [selectedOrderType, form]); */
    // Better to just hide and not force clear immediately to avoid accidental data loss if switching back and forth?
    // But validation might fail if we leave it? Schema says optional. So it's fine.

    // Calculate totals
    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: 'items'
    });

    const watchItems = useWatch({ control: form.control, name: 'items' });
    const totalAmount = watchItems?.reduce((sum, item) => sum + ((item.quantity || 0) * (item.unitPrice || 0)), 0);

    async function onSubmit(data: SalesOrderFormValues) {
        setIsSubmitting(true);
        try {
            const result = mode === 'create'
                ? await createSalesOrder(data as CreateSalesOrderValues)
                : await updateSalesOrder({ ...data, id: initialData!.id } as UpdateSalesOrderValues);

            if (result.success) {
                toast.success(`Sales Order ${mode === 'create' ? 'Created' : 'Updated'}`);
                router.push('/dashboard/sales');
            } else {
                toast.error(result.error || "Failed to save order");
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
                    {/* Customer - Only show for MTO */}
                    {selectedOrderType !== 'MAKE_TO_STOCK' && (
                        <FormField
                            control={form.control}
                            name="customerId"
                            render={({ field }) => (
                                <FormItem className="flex flex-col">
                                    <FormLabel>Customer</FormLabel>
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
                                                        : "Select customer"}
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
                    )}

                    {/* Source Location */}
                    <FormField
                        control={form.control}
                        name="sourceLocationId"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Source Location (Warehouse)</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder="Select warehouse" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {validLocations.map((loc) => (
                                            <SelectItem key={loc.id} value={loc.id}>
                                                {loc.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    {/* Order Type */}
                    <FormField
                        control={form.control}
                        name="orderType"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Order Type</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value || 'MAKE_TO_STOCK'}>
                                    <FormControl>
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder="Select order type" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="MAKE_TO_STOCK">Make to Stock (MTS)</SelectItem>
                                        <SelectItem value="MAKE_TO_ORDER">Make to Order (MTO)</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    {/* Order Date */}
                    <FormField
                        control={form.control}
                        name="orderDate"
                        render={({ field }) => (
                            <FormItem className="flex flex-col">
                                <FormLabel>Order Date</FormLabel>
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
                                                return date > today || date < new Date("1900-01-01");
                                            }}
                                            initialFocus
                                        />
                                    </PopoverContent>
                                </Popover>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    {/* Expected Date */}
                    {selectedOrderType !== 'MAKE_TO_STOCK' && (
                        <FormField
                            control={form.control}
                            name="expectedDate"
                            render={({ field }) => (
                                <FormItem className="flex flex-col">
                                    <FormLabel>Estimated Delivery Date</FormLabel>
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
                                                selected={field.value as Date} // Type assertion since expectedDate can be null
                                                onSelect={field.onChange}
                                                disabled={(date) =>
                                                    date < new Date("1900-01-01")
                                                }
                                                initialFocus
                                            />
                                        </PopoverContent>
                                    </Popover>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    )}

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
                            onClick={() => append({ productVariantId: '', quantity: 1, unitPrice: 0 })}
                        >
                            <Plus className="mr-2 h-4 w-4" /> Add Item
                        </Button>
                    </div>

                    <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                                <tr className="border-b">
                                    <th className="h-10 px-4 text-left font-medium">Product</th>
                                    <th className="h-10 px-4 text-left font-medium w-[120px]">Qty</th>
                                    <th className="h-10 px-4 text-left font-medium w-[150px]">Unit Price</th>
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
                                                            <SelectTrigger className="border-0 shadow-none bg-transparent h-auto p-2">
                                                                <SelectValue placeholder="Select Product" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {filteredProducts.map((p) => (
                                                                    <SelectItem key={p.id} value={p.id}>
                                                                        {p.product.name} - {p.name} ({p.skuCode})
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
                                        <td className="p-4 text-right tabular-nums">
                                            {formatRupiah(
                                                (form.watch(`items.${index}.quantity`) || 0) *
                                                (form.watch(`items.${index}.unitPrice`) || 0)
                                            )}
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
                                    <td colSpan={3} className="px-4 py-3 text-right">Total Amount</td>
                                    <td className="px-4 py-3 text-right">{formatRupiah(totalAmount)}</td>
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
                        {mode === 'create' ? 'Create Order' : 'Update Order'}
                    </Button>
                </div>
            </form>
        </Form>
    );
}
