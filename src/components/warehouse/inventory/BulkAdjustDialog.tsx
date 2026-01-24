'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { bulkAdjustStockSchema, BulkAdjustStockValues } from '@/lib/schemas/inventory';
import { adjustStockBulk } from '@/actions/inventory';
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
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

// Reusing InventoryItem interface
interface InventoryItem {
    id: string;
    locationId: string;
    productVariantId: string;
    quantity: number;
    productVariant: {
        id: string;
        name: string;
        skuCode: string;
        primaryUnit: string;
    };
    location: {
        id: string;
        name: string;
    };
    availableQuantity?: number;
}

interface BulkAdjustDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    items: InventoryItem[];
    userId?: string;
}

export function BulkAdjustDialog({ open, onOpenChange, items, userId }: BulkAdjustDialogProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Global controls state
    const [globalType, setGlobalType] = useState<'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT'>('ADJUSTMENT_OUT');
    const [globalReason, setGlobalReason] = useState('');

    const locationId = items.length > 0 ? items[0].locationId : '';
    const locationName = items.length > 0 ? items[0].location.name : '';
    const isRawMaterialLocation = locationName.toLowerCase().includes('raw material');

    const form = useForm<BulkAdjustStockValues>({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resolver: zodResolver(bulkAdjustStockSchema) as any,
        defaultValues: {
            locationId: locationId,
            items: items.map(item => ({
                productVariantId: item.productVariantId,
                type: 'ADJUSTMENT_OUT',
                reason: '',
                quantity: 0,
                unitCost: 0
            }))
        }
    });

    // Reset items when dialog opens
    useEffect(() => {
        if (open) {
            form.reset({
                locationId: locationId,
                items: items.map(item => ({
                    productVariantId: item.productVariantId,
                    type: globalType,
                    reason: globalReason,
                    quantity: 0,
                    unitCost: 0
                }))
            });
        }
    }, [open, items, locationId, form, globalType, globalReason]);

    // Update form values when global controls change
    const applyGlobalSettings = () => {
        const currentItems = form.getValues('items');
        const updatedItems = currentItems.map(item => ({
            ...item,
            type: globalType,
            reason: globalReason
        }));
        form.setValue('items', updatedItems);
        toast.success("Applied global settings to all rows");
    };

    async function onSubmit(data: BulkAdjustStockValues) {
        setIsSubmitting(true);
        try {
            // Apply global settings if individual rows are empty/default?
            // Actually, the form values are what we submit.
            // Ensure type and reason are set.
            const validItems = data.items.filter(i => i.quantity > 0);

            if (validItems.length === 0) {
                toast.error("Please enter quantity for at least one item");
                setIsSubmitting(false);
                return;
            }

            // Ensure reason is filled
            if (validItems.some(i => !i.reason || i.reason.length < 3)) {
                toast.error("Reason is required (min 3 chars) for all adjusted items");
                setIsSubmitting(false);
                return;
            }

            const payload = { ...data, items: validItems };
            const result = await adjustStockBulk(payload, userId);

            if (result.success) {
                toast.success(`Successfully adjusted ${validItems.length} items`);
                onOpenChange(false);
            } else {
                toast.error(`Error: ${result.error}`);
            }
        } catch (_error) {
            toast.error("Failed to execute bulk adjustment");
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Bulk Adjust Stock</DialogTitle>
                    <DialogDescription>
                        Adjust stock for items in <strong>{locationName}</strong>.
                    </DialogDescription>
                </DialogHeader>

                {/* Global Controls */}
                <div className="bg-muted p-4 rounded-md space-y-4 mb-4">
                    <h4 className="font-semibold text-sm">Global Settings</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <FormLabel>Type</FormLabel>
                            <Select
                                value={globalType}
                                onValueChange={(val: 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT') => {
                                    setGlobalType(val);
                                    // Optionally auto-update form:
                                    // const items = form.getValues('items');
                                    // items.forEach((_, idx) => form.setValue(`items.${idx}.type`, val));
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ADJUSTMENT_IN">IN (Stock Increase)</SelectItem>
                                    <SelectItem value="ADJUSTMENT_OUT">OUT (Stock Decrease)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="col-span-2 space-y-2">
                            <FormLabel>Reason</FormLabel>
                            <div className="flex gap-2">
                                <Input
                                    placeholder="e.g. Damage, Expired, Found"
                                    value={globalReason}
                                    onChange={(e) => setGlobalReason(e.target.value)}
                                />
                                <Button type="button" variant="secondary" onClick={applyGlobalSettings}>Apply</Button>
                            </div>
                        </div>
                    </div>
                </div>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        {/* Items Table */}
                        <div className="border rounded-md">
                            <div className="grid grid-cols-12 gap-2 p-3 bg-muted/50 text-sm font-medium border-b">
                                <div className="col-span-4">Product</div>
                                <div className="col-span-2 text-right">Current</div>
                                <div className="col-span-2">Type</div>
                                <div className="col-span-1">Qty</div>
                                {isRawMaterialLocation && <div className="col-span-2">Unit Cost</div>}
                                <div className={isRawMaterialLocation ? "col-span-1" : "col-span-3"}>Reason</div>
                            </div>
                            <div className="max-h-[300px] overflow-y-auto">
                                {items.map((item, index) => (
                                    <div key={item.id} className="grid grid-cols-12 gap-2 p-3 items-center border-b last:border-0 hover:bg-muted/20">
                                        <div className="col-span-4">
                                            <div className="font-medium text-sm">{item.productVariant.name}</div>
                                            <div className="text-xs text-muted-foreground">{item.productVariant.skuCode}</div>
                                        </div>
                                        <div className="col-span-2 text-right text-sm">
                                            {item.quantity} <span className="text-xs text-muted-foreground">{item.productVariant.primaryUnit}</span>
                                        </div>
                                        <div className="col-span-2">
                                            <FormField
                                                control={form.control}
                                                name={`items.${index}.type`}
                                                render={({ field }) => (
                                                    <Select onValueChange={field.onChange} value={field.value}>
                                                        <FormControl>
                                                            <SelectTrigger className="h-8">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            <SelectItem value="ADJUSTMENT_IN">IN</SelectItem>
                                                            <SelectItem value="ADJUSTMENT_OUT">OUT</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                )}
                                            />
                                        </div>
                                        <div className="col-span-1">
                                            <FormField
                                                control={form.control}
                                                name={`items.${index}.quantity`}
                                                render={({ field }) => (
                                                    <FormItem className="mb-0 space-y-0">
                                                        <FormControl>
                                                            <Input
                                                                type="number"
                                                                min="0"
                                                                className="h-8 text-right"
                                                                {...field}
                                                                onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                                                            />
                                                        </FormControl>
                                                    </FormItem>
                                                )}
                                            />
                                        </div>
                                        {isRawMaterialLocation && (
                                            <div className="col-span-2">
                                                <FormField
                                                    control={form.control}
                                                    name={`items.${index}.unitCost`}
                                                    render={({ field }) => {
                                                        const type = form.watch(`items.${index}.type`);
                                                        const isOut = type === 'ADJUSTMENT_OUT';
                                                        return (
                                                            <FormItem className="mb-0 space-y-0">
                                                                <FormControl>
                                                                    <Input
                                                                        type="number"
                                                                        min="0"
                                                                        className="h-8 text-right"
                                                                        placeholder={isOut ? "-" : "Auto"}
                                                                        disabled={isOut}
                                                                        {...field}
                                                                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                                                                    />
                                                                </FormControl>
                                                            </FormItem>
                                                        );
                                                    }}
                                                />
                                            </div>
                                        )}
                                        <div className={isRawMaterialLocation ? "col-span-1" : "col-span-3"}>
                                            <FormField
                                                control={form.control}
                                                name={`items.${index}.reason`}
                                                render={({ field }) => (
                                                    <FormItem className="mb-0 space-y-0">
                                                        <FormControl>
                                                            <Input className="h-8" placeholder="Reason" {...field} />
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
                                Confirm Adjustment
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
