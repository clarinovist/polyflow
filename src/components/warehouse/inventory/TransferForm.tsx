'use client';

import { useForm, useFieldArray, useWatch, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { bulkTransferStockSchema, BulkTransferStockValues } from '@/lib/schemas/inventory';
import { transferStockBulk } from '@/actions/inventory';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useMemo, useEffect, useState } from 'react';
import { Plus, Trash2, ArrowRight, Package, ClipboardList } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ProductCombobox } from '@/components/ui/product-combobox';

interface TransferFormProps {
    locations: { id: string; name: string }[];
    products: { id: string; name: string; skuCode: string }[];
    inventory: { locationId: string; productVariantId: string; quantity: number }[];
}

export function TransferForm({ locations, products, inventory }: TransferFormProps) {
    const router = useRouter();

    const [newItem, setNewItem] = useState<{ productVariantId: string; quantity: string }>({
        productVariantId: '',
        quantity: ''
    });

    const form = useForm<BulkTransferStockValues>({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resolver: zodResolver(bulkTransferStockSchema) as any,
        defaultValues: {
            sourceLocationId: '',
            destinationLocationId: '',
            items: [],
            notes: '',
            date: new Date(),
        },
        mode: 'onChange',
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "items",
    });

    const sourceLocationId = useWatch({ control: form.control, name: 'sourceLocationId' });
    const destinationLocationId = useWatch({ control: form.control, name: 'destinationLocationId' });

    const availableProducts = useMemo(() => {
        if (!sourceLocationId) return [];
        return inventory
            .filter(i => i.locationId === sourceLocationId && i.quantity > 0)
            .map(i => {
                const product = products.find(p => p.id === i.productVariantId);
                return product ? { ...product, quantity: i.quantity } : null;
            })
            .filter((p): p is (typeof products[0] & { quantity: number }) => p !== null);
    }, [sourceLocationId, inventory, products]);

    useEffect(() => {
        if (sourceLocationId && destinationLocationId && sourceLocationId === destinationLocationId) {
            form.setValue('destinationLocationId', '', { shouldValidate: true });
            toast.error("Source and destination cannot be the same");
        }
    }, [sourceLocationId, destinationLocationId, form]);

    useEffect(() => {
        form.setValue('items', []);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setNewItem({ productVariantId: '', quantity: '' });
    }, [sourceLocationId, form]);

    const handleAddItem = () => {
        if (!newItem.productVariantId || !newItem.quantity) {
            toast.error("Please select a product and enter a quantity.");
            return;
        }
        const qty = parseFloat(newItem.quantity);
        if (isNaN(qty) || qty <= 0) {
            toast.error("Please enter a valid positive quantity.");
            return;
        }
        const selectedProduct = availableProducts.find(p => p.id === newItem.productVariantId);
        if (!selectedProduct) {
            toast.error("Selected product not found or not available at source location.");
            return;
        }
        if (qty > selectedProduct.quantity) {
            toast.error(`Insufficient stock. Max available: ${selectedProduct.quantity}`);
            return;
        }
        const existingIndex = fields.findIndex(f => f.productVariantId === newItem.productVariantId);
        if (existingIndex >= 0) {
            toast.error("Product already in transfer list. Remove it first to update quantity.");
            return;
        }
        append({ productVariantId: newItem.productVariantId, quantity: qty });
        setNewItem({ productVariantId: '', quantity: '' });
    };

    const onSubmit: SubmitHandler<BulkTransferStockValues> = async (data) => {
        const result = await transferStockBulk(data);
        if (result.success) {
            toast.success('Stock transferred successfully');
            form.reset({ sourceLocationId: '', destinationLocationId: '', items: [], notes: '', date: new Date() });
            setNewItem({ productVariantId: '', quantity: '' });
            router.refresh();
        } else {
            toast.error(result.error || 'Failed to transfer stock');
        }
    }

    const getProductDetails = (id: string) => {
        const p = products.find(prod => prod.id === id);
        return p ? { name: p.name, sku: p.skuCode } : { name: 'Unknown', sku: '-' };
    };

    const currentSelectedProductMax = useMemo(() => {
        if (!newItem.productVariantId) return 0;
        return availableProducts.find(p => p.id === newItem.productVariantId)?.quantity || 0;
    }, [newItem.productVariantId, availableProducts]);

    const sourceName = locations.find(l => l.id === sourceLocationId)?.name;
    const destName = locations.find(l => l.id === destinationLocationId)?.name;

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">

                    <Card className="border-border/50 shadow-sm overflow-hidden flex flex-col">
                        <CardHeader className="px-6 py-3.5 shrink-0">
                            <div className="flex items-center gap-3">
                                <Package className="h-4 w-4 text-primary shrink-0" />
                                <div className="flex flex-col">
                                    <CardTitle className="text-sm font-semibold leading-none">Add Transfer Items</CardTitle>
                                    <CardDescription className="text-[10px] text-muted-foreground/60 mt-0.5">Select route and add products</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <div className="h-px bg-border/50 mx-6" />
                        <CardContent className="px-6 py-6 space-y-6 flex-1 overflow-auto">
                            {/* Transfer Route Section - HORIZONTAL */}
                            <div className="space-y-3">
                                <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-2">
                                    <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">1</span>
                                    Transfer Route
                                </h4>
                                <div className="flex items-center gap-3">
                                    <FormField
                                        control={form.control}
                                        name="sourceLocationId"
                                        render={({ field }) => (
                                            <FormItem className="flex-1">
                                                <FormLabel className="text-xs text-muted-foreground">From</FormLabel>
                                                <Select onValueChange={field.onChange} value={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger className="h-11 bg-background">
                                                            <SelectValue placeholder="Source warehouse" />
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
                                    <div className="pt-6">
                                        <div className="p-2 rounded-full bg-muted border border-border">
                                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                    </div>
                                    <FormField
                                        control={form.control}
                                        name="destinationLocationId"
                                        render={({ field }) => (
                                            <FormItem className="flex-1">
                                                <FormLabel className="text-xs text-muted-foreground">To</FormLabel>
                                                <Select onValueChange={field.onChange} value={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger className="h-11 bg-background">
                                                            <SelectValue placeholder="Destination" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {locations.map((loc) => (
                                                            <SelectItem key={loc.id} value={loc.id} disabled={loc.id === sourceLocationId}>{loc.name}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            </div>

                            <div className="h-px bg-border" />

                            {/* Add Products Section */}
                            <div className={`space-y-4 transition-opacity ${!sourceLocationId ? 'opacity-50 pointer-events-none' : ''}`}>
                                <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-2">
                                    <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">2</span>
                                    Add Product
                                    {sourceLocationId && (
                                        <Badge variant="outline" className="text-[10px] ml-auto font-normal">{availableProducts.length} available</Badge>
                                    )}
                                </h4>

                                <FormItem>
                                    <FormLabel className="text-xs text-muted-foreground">Product</FormLabel>
                                    <ProductCombobox
                                        products={availableProducts}
                                        value={newItem.productVariantId}
                                        onValueChange={(val) => setNewItem(prev => ({ ...prev, productVariantId: val }))}
                                        disabled={!sourceLocationId}
                                        placeholder="Search product by name or SKU..."
                                        emptyMessage="No products found in source location."
                                    />
                                </FormItem>

                                <FormItem>
                                    <div className="flex items-center justify-between">
                                        <FormLabel className="text-xs text-muted-foreground">Quantity</FormLabel>
                                        {newItem.productVariantId && (
                                            <span className="text-xs text-muted-foreground">Max: <span className="font-semibold text-foreground">{currentSelectedProductMax}</span></span>
                                        )}
                                    </div>
                                    <Input
                                        type="number"
                                        step="1"
                                        min="1"
                                        value={newItem.quantity}
                                        onChange={(e) => setNewItem(prev => ({ ...prev, quantity: e.target.value }))}
                                        placeholder="Enter quantity"
                                        className="h-11 bg-background"
                                        max={currentSelectedProductMax}
                                    />
                                </FormItem>

                                {/* Prominent Add Button */}
                                <Button
                                    type="button"
                                    onClick={handleAddItem}
                                    disabled={!sourceLocationId || !newItem.productVariantId || !newItem.quantity}
                                    className="w-full h-11 text-xs font-bold shadow-sm shadow-primary/10"
                                >
                                    <Plus className="h-3.5 w-3.5 mr-2" />
                                    Add to Manifest
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* RIGHT CARD: Manifest & Review - STICKY FOOTER */}
                    <Card className="border-border/50 shadow-sm flex flex-col sticky top-6 overflow-hidden max-h-full">
                        <CardHeader className="px-6 py-3.5 shrink-0">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <ClipboardList className="h-4 w-4 text-primary shrink-0" />
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-2">
                                            <CardTitle className="text-sm font-semibold leading-none">Transfer Manifest</CardTitle>
                                            {fields.length > 0 && (
                                                <Badge className="h-4 px-1 text-[9px] font-bold bg-primary text-primary-foreground leading-none">{fields.length} item{fields.length > 1 ? 's' : ''}</Badge>
                                            )}
                                        </div>
                                        <CardDescription className="text-[10px] text-muted-foreground/60 mt-0.5">
                                            {fields.length > 0 ? 'Ready for confirmation' : 'No items added yet'}
                                        </CardDescription>
                                    </div>
                                </div>
                            </div>
                        </CardHeader>
                        <div className="h-px bg-border/50 mx-6" />

                        {/* Content Area */}
                        <CardContent className="flex-1 flex flex-col px-0 pt-4 overflow-hidden">
                            {/* Transfer Summary - TOP STICKY WITHIN CONTENT */}
                            {(sourceName || destName) && (
                                <div className="px-6 pb-4 shrink-0">
                                    <div className="flex items-center gap-2 text-sm p-3 rounded-lg bg-muted/50 border border-border/50">
                                        <span className="font-medium text-foreground">{sourceName || '—'}</span>
                                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                        <span className="font-medium text-foreground">{destName || '—'}</span>
                                    </div>
                                </div>
                            )}

                            {/* Scrollable Item List */}
                            <div className="flex-1 overflow-y-auto px-6 pr-4 space-y-2 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent">
                                {fields.length === 0 ? (
                                    <div className="h-full min-h-[140px] flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed rounded-lg bg-muted/20 p-4">
                                        <Package className="h-8 w-8 mb-2 opacity-40" />
                                        <p className="text-sm font-medium">No items added</p>
                                        <p className="text-xs mt-1">Add products from the left panel</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2 pb-2">
                                        {fields.map((field, index) => {
                                            const details = getProductDetails(field.productVariantId);
                                            return (
                                                <div key={field.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50 group hover:bg-muted/50 transition-colors">
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-8 w-8 rounded-md bg-background border flex items-center justify-center text-xs font-mono text-muted-foreground shrink-0">
                                                            {index + 1}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-medium text-foreground truncate">{details.name}</p>
                                                            <p className="text-xs text-muted-foreground">{details.sku}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <Badge variant="outline" className="font-semibold text-xs">
                                                            {field.quantity}
                                                        </Badge>
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
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* STICKY Footer Components - Symmetrical Padding */}
                            <div className="shrink-0 pt-4 px-6 pb-6 bg-card border-t border-border/40 shadow-[0_-8px_20px_rgba(0,0,0,0.08)]">
                                <FormField
                                    control={form.control}
                                    name="notes"
                                    render={({ field }) => (
                                        <FormItem className="space-y-1.5">
                                            <FormLabel className="text-[10px] text-muted-foreground font-bold uppercase tracking-tight">Notes (Optional)</FormLabel>
                                            <FormControl>
                                                <Textarea
                                                    {...field}
                                                    placeholder="Reference or internal notes..."
                                                    className="resize-none h-16 bg-background/50 text-[13px] border-border/40 focus-visible:ring-primary/20 hover:border-border/60 transition-colors"
                                                />
                                            </FormControl>
                                            <FormMessage className="text-[10px]" />
                                        </FormItem>
                                    )}
                                />

                                <Button
                                    type="submit"
                                    disabled={form.formState.isSubmitting || fields.length === 0 || !destinationLocationId}
                                    className="w-full mt-4 h-12 text-sm font-bold shadow-lg shadow-primary/20 active:scale-[0.98] transition-all"
                                    size="lg"
                                >
                                    {form.formState.isSubmitting ? (
                                        <span className="flex items-center gap-2"><span className="h-3 w-3 border-2 border-background/30 border-t-background rounded-full animate-spin" /> Processing...</span>
                                    ) : (
                                        `Confirm ${fields.length} Item${fields.length !== 1 ? 's' : ''} Transfer`
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
