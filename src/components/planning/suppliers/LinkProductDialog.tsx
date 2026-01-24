'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
    FormDescription,
} from '@/components/ui/form';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Loader2, Star } from 'lucide-react';
import { toast } from 'sonner';
import { linkSupplierToProduct } from '@/actions/supplier-product';
import { getVariants } from '@/actions/product';

const formSchema = z.object({
    productVariantId: z.string().min(1, 'Product is required'),
    unitPrice: z.coerce.number().nonnegative('Price must be non-negative'),
    leadTimeDays: z.coerce.number().int().nonnegative(),
    minOrderQty: z.coerce.number().nonnegative(),
    isPreferred: z.boolean(),
    notes: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface LinkProductDialogProps {
    supplierId: string;
    supplierName: string;
}

interface Variant {
    id: string;
    skuCode: string;
    name: string;
    product: {
        name: string;
    };
}

export function LinkProductDialog({ supplierId, supplierName }: LinkProductDialogProps) {
    const [open, setOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [variants, setVariants] = useState<Variant[]>([]);
    const [isFetchingVariants, setIsFetchingVariants] = useState(false);

    const form = useForm<FormValues>({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resolver: zodResolver(formSchema) as any,
        defaultValues: {
            productVariantId: '',
            unitPrice: 0,
            leadTimeDays: 0,
            minOrderQty: 0,
            isPreferred: false,
            notes: '',
        },
    });

    useEffect(() => {
        if (open) {
            setIsFetchingVariants(true);
            getVariants().then((data) => {
                setVariants(data as Variant[]);
                setIsFetchingVariants(false);
            });
        }
    }, [open]);

    async function onSubmit(values: FormValues) {
        setIsLoading(true);
        try {
            const result = await linkSupplierToProduct({
                supplierId,
                productVariantId: values.productVariantId,
                unitPrice: values.unitPrice,
                leadTimeDays: values.leadTimeDays,
                minOrderQty: values.minOrderQty,
                isPreferred: values.isPreferred,
                notes: values.notes,
            });

            if (result.success) {
                toast.success('Product linked successfully');
                setOpen(false);
                form.reset({
                    productVariantId: '',
                    unitPrice: 0,
                    leadTimeDays: 0,
                    minOrderQty: 0,
                    isPreferred: false,
                    notes: '',
                });
            } else {
                toast.error(result.error || 'Failed to link product');
            }
        } catch (_error) {
            toast.error('An unexpected error occurred');
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm" className="gap-2">
                    <Plus className="h-4 w-4" />
                    Link Product
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Link Product to {supplierName}</DialogTitle>
                    <DialogDescription>
                        Set the purchase price and details for this supplier.
                    </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                        <FormField
                            control={form.control}
                            name="productVariantId"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Product Variant</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder={isFetchingVariants ? "Loading..." : "Select a product"} />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {variants.map((variant) => (
                                                <SelectItem key={variant.id} value={variant.id}>
                                                    {variant.skuCode} - {variant.product.name} ({variant.name})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="unitPrice"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Purchase Price</FormLabel>
                                        <FormControl>
                                            <Input type="number" step="0.01" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="leadTimeDays"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Lead Time (Days)</FormLabel>
                                        <FormControl>
                                            <Input type="number" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <FormField
                            control={form.control}
                            name="minOrderQty"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Min Order Qty</FormLabel>
                                    <FormControl>
                                        <Input type="number" step="0.01" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="isPreferred"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-lg border border-zinc-200 dark:border-zinc-700 p-4 bg-zinc-50/50 dark:bg-zinc-800/50">
                                    <FormControl>
                                        <Checkbox
                                            checked={field.value}
                                            onCheckedChange={field.onChange}
                                            className="h-5 w-5"
                                        />
                                    </FormControl>
                                    <div className="flex items-center gap-2 flex-1">
                                        <Star className="h-4 w-4 text-amber-500" />
                                        <div className="space-y-0.5 leading-none">
                                            <FormLabel className="text-sm font-medium">Preferred Supplier</FormLabel>
                                            <FormDescription className="text-xs text-muted-foreground">
                                                Set as the default supplier for this product variant.
                                            </FormDescription>
                                        </div>
                                    </div>
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="notes"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Notes</FormLabel>
                                    <FormControl>
                                        <Textarea placeholder="Specific terms or notes..." {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isLoading}>
                                {isLoading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Linking...
                                    </>
                                ) : (
                                    'Link Product'
                                )}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
