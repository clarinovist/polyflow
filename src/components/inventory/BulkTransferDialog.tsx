'use client';

import { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { bulkTransferStockSchema, BulkTransferStockValues } from '@/lib/zod-schemas';
import { transferStockBulk } from '@/actions/inventory';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2, Trash2 } from 'lucide-react';
import { getLocations } from '@/actions/locations';

// Type definition for the items passed to the dialog
interface InventoryItem {
    id: string;
    locationId: string;
    productVariantId: string;
    quantity: number;
    productVariant: {
        id: string;
        name: string;
        skuCode: string;
        primaryUnit: string; // Changed from enum to string to avoid import issues or just string
    };
    location: {
        id: string;
        name: string;
    };
    availableQuantity?: number;
}

interface BulkTransferDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    items: InventoryItem[];
    userId?: string; // Optional for audit
}

export function BulkTransferDialog({ open, onOpenChange, items, userId }: BulkTransferDialogProps) {
    const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const sourceLocationId = items.length > 0 ? items[0].locationId : '';
    const sourceLocationName = items.length > 0 ? items[0].location.name : '';

    const form = useForm<BulkTransferStockValues>({
        resolver: zodResolver(bulkTransferStockSchema) as any, // Cast to any to avoid strict type mismatch with useForm
        defaultValues: {
            sourceLocationId: sourceLocationId,
            destinationLocationId: '',
            date: new Date(),
            notes: '',
            items: items.map(item => ({
                productVariantId: item.productVariantId,
                quantity: 0
            }))
        }
    });

    // Reset items when dialog opens with new items
    useEffect(() => {
        if (open) {
            form.reset({
                sourceLocationId: sourceLocationId,
                destinationLocationId: '',
                date: new Date(),
                notes: '',
                items: items.map(item => ({
                    productVariantId: item.productVariantId,
                    quantity: 0
                }))
            });

            // Fetch locations
            getLocations().then(res => {
                setLocations(res);
            });
        }
    }, [open, items, sourceLocationId, form]);

    async function onSubmit(data: BulkTransferStockValues) {
        setIsSubmitting(true);
        try {
            // Filter out items with 0 quantity
            const validItems = data.items.filter(i => i.quantity > 0);

            if (validItems.length === 0) {
                toast.error("Please enter quantity to transfer for at least one item");
                setIsSubmitting(false);
                return;
            }

            const payload = { ...data, items: validItems };
            const result = await transferStockBulk(payload, userId);

            if (result.success) {
                toast.success(`Successfully transferred ${validItems.length} items`);
                onOpenChange(false);
            } else {
                toast.error(`Error: ${result.error}`);
            }
        } catch (error) {
            toast.error("Failed to execute bulk transfer");
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Bulk Transfer Stock</DialogTitle>
                    <DialogDescription>
                        Transfer items from <strong>{sourceLocationName}</strong> to another location.
                    </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="destinationLocationId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Destination Location</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select destination..." />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {locations
                                                    .filter(l => l.id !== sourceLocationId)
                                                    .map((location) => (
                                                        <SelectItem key={location.id} value={location.id}>
                                                            {location.name}
                                                        </SelectItem>
                                                    ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="notes"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Notes / Reference</FormLabel>
                                        <FormControl>
                                            <Input placeholder="e.g. Shipment #123" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        {/* Items Table */}
                        <div className="border rounded-md">
                            <div className="grid grid-cols-12 gap-2 p-3 bg-muted/50 text-sm font-medium border-b">
                                <div className="col-span-6">Product</div>
                                <div className="col-span-2 text-right">Available</div>
                                <div className="col-span-4 text-right">Transfer Qty</div>
                            </div>
                            <div className="max-h-[300px] overflow-y-auto">
                                {items.map((item, index) => (
                                    <div key={item.id} className="grid grid-cols-12 gap-2 p-3 items-center border-b last:border-0 hover:bg-muted/20">
                                        <div className="col-span-6">
                                            <div className="font-medium text-sm">{item.productVariant.name}</div>
                                            <div className="text-xs text-muted-foreground">{item.productVariant.skuCode}</div>
                                        </div>
                                        <div className="col-span-2 text-right text-sm">
                                            {item.availableQuantity ?? item.quantity} <span className="text-xs text-muted-foreground">{item.productVariant.primaryUnit}</span>
                                        </div>
                                        <div className="col-span-4">
                                            <FormField
                                                control={form.control}
                                                name={`items.${index}.quantity`}
                                                render={({ field }) => (
                                                    <FormItem className="mb-0 space-y-0">
                                                        <FormControl>
                                                            <Input
                                                                type="number"
                                                                min="0"
                                                                max={item.availableQuantity ?? item.quantity}
                                                                className="h-8 text-right"
                                                                {...field}
                                                                onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                                                            />
                                                        </FormControl>
                                                    </FormItem>
                                                )}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Confirm Transfer
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
