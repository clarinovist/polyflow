'use client';

import { useForm, useFieldArray, useWatch, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { bulkAdjustStockSchema, BulkAdjustStockValues } from '@/lib/zod-schemas';
import { adjustStockBulk } from '@/actions/inventory';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useEffect } from 'react';
import { Plus, Trash2, Package, ClipboardList, AlertCircle, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface SerializedInventory {
    locationId: string;
    productVariantId: string;
    quantity: number;
}

interface AdjustmentFormProps {
    locations: { id: string; name: string }[];
    products: { id: string; name: string; skuCode: string }[];
    inventory: SerializedInventory[];
}

export function AdjustmentForm({ locations, products, inventory }: AdjustmentFormProps) {
    const router = useRouter();

    const [newItem, setNewItem] = useState<{
        productVariantId: string;
        type: 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT';
        quantity: string;
        reason: string;
    }>({
        productVariantId: '',
        type: 'ADJUSTMENT_IN',
        quantity: '',
        reason: ''
    });

    const form = useForm<BulkAdjustStockValues>({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resolver: zodResolver(bulkAdjustStockSchema) as any,
        defaultValues: {
            locationId: '',
            items: [],
        },
        mode: 'onChange'
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "items",
    });

    const selectedLocationId = useWatch({ control: form.control, name: 'locationId' });

    // Filter products based on selected location
    const availableProducts = useMemo(() => {
        return products.map(prod => {
            const inv = inventory.find(
                (item) => item.locationId === selectedLocationId && item.productVariantId === prod.id
            );
            return { ...prod, quantity: inv ? inv.quantity : 0 };
        });
    }, [products, inventory, selectedLocationId]);

    // Reset items if location changes
    useEffect(() => {
        form.setValue('items', []);
        setNewItem({
            productVariantId: '',
            type: 'ADJUSTMENT_IN',
            quantity: '',
            reason: ''
        });
    }, [selectedLocationId, form]);

    const handleAddItem = () => {
        if (!selectedLocationId) {
            toast.error("Please select a location first.");
            return;
        }
        if (!newItem.productVariantId || !newItem.quantity) {
            toast.error("Please select a product and enter a quantity.");
            return;
        }

        const qty = parseFloat(newItem.quantity);
        if (isNaN(qty) || qty <= 0) {
            toast.error("Please enter a valid positive quantity.");
            return;
        }

        // Check stock for OUT adjustments
        if (newItem.type === 'ADJUSTMENT_OUT') {
            const currentStock = availableProducts.find(p => p.id === newItem.productVariantId)?.quantity || 0;
            if (qty > currentStock) {
                toast.error(`Insufficient stock for reduction. Max available: ${currentStock}`);
                return;
            }
        }

        append({
            productVariantId: newItem.productVariantId,
            type: newItem.type,
            quantity: qty,
            reason: newItem.reason || 'Stock Adjustment' // Default reason
        });

        // Reset inputs but keep type? Or reset all?
        setNewItem(prev => ({
            ...prev,
            productVariantId: '',
            quantity: '',
            reason: ''
        }));
    };

    const onSubmit: SubmitHandler<BulkAdjustStockValues> = async (data) => {
        const result = await adjustStockBulk(data);
        if (result.success) {
            toast.success('Stock adjusted successfully');
            form.reset({
                locationId: '',
                items: [],
            });
            setNewItem({
                productVariantId: '',
                type: 'ADJUSTMENT_IN',
                quantity: '',
                reason: ''
            });
            router.refresh();
        } else {
            toast.error(result.error || 'Failed to adjust stock');
        }
    };

    const getProductDetails = (id: string) => {
        const p = products.find(prod => prod.id === id);
        return p ? { name: p.name, sku: p.skuCode } : { name: 'Unknown', sku: '-' };
    };

    const currentSelectedProductMax = useMemo(() => {
        if (!newItem.productVariantId) return 0;
        return availableProducts.find(p => p.id === newItem.productVariantId)?.quantity || 0;
    }, [newItem.productVariantId, availableProducts]);

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">

                    {/* LEFT CARD: Input Section */}
                    <Card className="border-border/50 shadow-sm overflow-hidden flex flex-col">
                        <CardHeader className="px-6 py-3.5 shrink-0">
                            <div className="flex items-center gap-3">
                                <Package className="h-4 w-4 text-primary shrink-0" />
                                <div className="flex flex-col">
                                    <CardTitle className="text-sm font-semibold leading-none">Adjustment Details</CardTitle>
                                    <CardDescription className="text-[10px] text-muted-foreground/60 mt-0.5">Select location and add items</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <div className="h-px bg-border/50 mx-6" />
                        <CardContent className="px-6 py-6 space-y-6 flex-1 overflow-auto">

                            {/* Location Section */}
                            <div className="space-y-3">
                                <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-2">
                                    <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">1</span>
                                    Location
                                </h4>
                                <FormField
                                    control={form.control}
                                    name="locationId"
                                    render={({ field }) => (
                                        <FormItem>
                                            <Select onValueChange={field.onChange} value={field.value}>
                                                <FormControl>
                                                    <SelectTrigger className="h-11 bg-background">
                                                        <SelectValue placeholder="Select Warehouse Location" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {locations.map((loc) => (
                                                        <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <div className="h-px bg-border" />

                            {/* Item Inputs */}
                            <div className={`space-y-4 transition-opacity ${!selectedLocationId ? 'opacity-50 pointer-events-none' : ''}`}>
                                <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-2">
                                    <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">2</span>
                                    Add Item
                                </h4>

                                <FormItem>
                                    <FormLabel className="text-xs text-muted-foreground">Product</FormLabel>
                                    <Select
                                        value={newItem.productVariantId}
                                        onValueChange={(val) => setNewItem(prev => ({ ...prev, productVariantId: val }))}
                                        disabled={!selectedLocationId}
                                    >
                                        <SelectTrigger className="h-11 bg-background">
                                            <SelectValue placeholder="Choose a product..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {availableProducts.map((prod) => (
                                                <SelectItem key={prod.id} value={prod.id}>
                                                    <span className="font-medium">{prod.skuCode}</span>
                                                    <span className="text-muted-foreground ml-2">- {prod.name}</span>
                                                    <Badge variant="secondary" className="ml-2 text-xs">Qty: {prod.quantity}</Badge>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </FormItem>

                                <div className="grid grid-cols-2 gap-4">
                                    <FormItem>
                                        <FormLabel className="text-xs text-muted-foreground">Type</FormLabel>
                                        <Select
                                            value={newItem.type}
                                            onValueChange={(val: 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT') => setNewItem(prev => ({ ...prev, type: val }))}
                                        >
                                            <SelectTrigger className="h-11 bg-background">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="ADJUSTMENT_IN">
                                                    <div className="flex items-center gap-2 text-emerald-600">
                                                        <ArrowUpCircle className="h-4 w-4" />
                                                        <span>Surplus (IN)</span>
                                                    </div>
                                                </SelectItem>
                                                <SelectItem value="ADJUSTMENT_OUT">
                                                    <div className="flex items-center gap-2 text-amber-600">
                                                        <ArrowDownCircle className="h-4 w-4" />
                                                        <span>Deficit (OUT)</span>
                                                    </div>
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </FormItem>

                                    <FormItem>
                                        <div className="flex items-center justify-between">
                                            <FormLabel className="text-xs text-muted-foreground">Quantity</FormLabel>
                                            {newItem.type === 'ADJUSTMENT_OUT' && newItem.productVariantId && (
                                                <span className="text-[10px] text-muted-foreground">Max: {currentSelectedProductMax}</span>
                                            )}
                                        </div>
                                        <Input
                                            type="number"
                                            step="1"
                                            min="1"
                                            value={newItem.quantity}
                                            onChange={(e) => setNewItem(prev => ({ ...prev, quantity: e.target.value }))}
                                            className="h-11 bg-background"
                                            max={newItem.type === 'ADJUSTMENT_OUT' ? currentSelectedProductMax : undefined}
                                        />
                                    </FormItem>
                                </div>

                                <FormItem>
                                    <FormLabel className="text-xs text-muted-foreground">Reason</FormLabel>
                                    <Textarea
                                        value={newItem.reason}
                                        onChange={(e) => setNewItem(prev => ({ ...prev, reason: e.target.value }))}
                                        placeholder="e.g. Broken packaging, Found in stock opname..."
                                        className="resize-none h-20 bg-background text-sm"
                                    />
                                </FormItem>

                                <Button
                                    type="button"
                                    onClick={handleAddItem}
                                    disabled={!selectedLocationId || !newItem.productVariantId || !newItem.quantity}
                                    className="w-full h-11 text-xs font-bold shadow-sm shadow-primary/10"
                                >
                                    <Plus className="h-3.5 w-3.5 mr-2" />
                                    Add to Manifest
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* RIGHT CARD: Manifest */}
                    <Card className="border-border/50 shadow-sm flex flex-col sticky top-6 overflow-hidden max-h-full">
                        <CardHeader className="px-6 py-3.5 shrink-0">
                            <div className="flex items-center gap-3">
                                <ClipboardList className="h-4 w-4 text-primary shrink-0" />
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-2">
                                        <CardTitle className="text-sm font-semibold leading-none">Adjustment Manifest</CardTitle>
                                        {fields.length > 0 && (
                                            <Badge className="h-4 px-1 text-[9px] font-bold bg-primary text-primary-foreground leading-none">{fields.length} item{fields.length > 1 ? 's' : ''}</Badge>
                                        )}
                                    </div>
                                    <CardDescription className="text-[10px] text-muted-foreground/60 mt-0.5">
                                        Review items before confirming
                                    </CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <div className="h-px bg-border/50 mx-6" />

                        <CardContent className="flex-1 flex flex-col px-0 pt-4 overflow-hidden">
                            <div className="flex-1 overflow-y-auto px-6 pr-4 space-y-2 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent">
                                {fields.length === 0 ? (
                                    <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed rounded-lg bg-muted/20 p-4">
                                        <AlertCircle className="h-8 w-8 mb-2 opacity-40" />
                                        <p className="text-sm font-medium">No items added</p>
                                        <p className="text-xs mt-1">Add adjustment details from the left</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2 pb-2">
                                        {fields.map((field, index) => {
                                            const details = getProductDetails(field.productVariantId);
                                            return (
                                                <div key={field.id} className="flex flex-col p-3 rounded-lg bg-muted/30 border border-border/50 group hover:bg-muted/50 transition-colors gap-2">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-3">
                                                            <div className="h-8 w-8 rounded-md bg-background border flex items-center justify-center text-xs font-mono text-muted-foreground shrink-0">
                                                                {index + 1}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="text-sm font-medium text-foreground truncate">{details.name}</p>
                                                                <p className="text-xs text-muted-foreground">{details.sku}</p>
                                                            </div>
                                                        </div>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10"
                                                            onClick={() => remove(index)}
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </div>

                                                    <div className="flex items-center gap-2 pl-11 text-xs">
                                                        <Badge variant={field.type === 'ADJUSTMENT_IN' ? 'secondary' : 'destructive'} className="text-[10px] h-5 px-1.5">
                                                            {field.type === 'ADJUSTMENT_IN' ? '+ IN' : '- OUT'}
                                                        </Badge>
                                                        <span className="font-semibold text-sm">{field.quantity}</span>
                                                        {field.reason && (
                                                            <span className="text-muted-foreground italic truncate max-w-[150px] border-l pl-2 border-border/50">
                                                                "{field.reason}"
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Footer */}
                            <div className="shrink-0 pt-4 px-6 pb-6 bg-card border-t border-border/40 shadow-[0_-8px_20px_rgba(0,0,0,0.08)]">
                                <Button
                                    type="submit"
                                    disabled={form.formState.isSubmitting || fields.length === 0}
                                    className="w-full h-12 text-sm font-bold shadow-lg shadow-primary/20 active:scale-[0.98] transition-all"
                                    size="lg"
                                >
                                    {form.formState.isSubmitting ? (
                                        <span className="flex items-center gap-2"><span className="h-3 w-3 border-2 border-background/30 border-t-background rounded-full animate-spin" /> Processing...</span>
                                    ) : (
                                        `Confirm Adjustment (${fields.length} Item${fields.length !== 1 ? 's' : ''})`
                                    )}
                                </Button>
                                {form.formState.errors.items && (
                                    <p className="text-destructive text-[10px] mt-2 text-center font-bold tracking-tight">{form.formState.errors.items.message}</p>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </form>
        </Form>
    );
}
