'use client';

import { useForm, useFieldArray, useWatch, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { bulkTransferStockSchema, BulkTransferStockValues } from '@/lib/schemas/inventory';
import { transferStockBulk } from '@/actions/inventory';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useMemo, useEffect, useState } from 'react';
import { Plus, Trash2, ArrowRight, Package, ClipboardList } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
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
                <Card className="border-border/50 shadow-sm bg-card overflow-hidden">
                    <CardContent className="p-0 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">

                        {/* LEFT COLUMN: INPUTS */}
                        <div className="flex flex-col h-full bg-card">
                            <div className="px-6 py-4 border-b border-border/50">
                                <h3 className="font-semibold text-sm flex items-center gap-2">
                                    <Package className="h-4 w-4 text-primary" />
                                    Add Transfer Items
                                </h3>
                                <p className="text-xs text-muted-foreground mt-0.5">Select route and add products</p>
                            </div>

                            <div className="p-6 space-y-8 flex-1">
                                {/* Transfer Route */}
                                <div className="space-y-3">
                                    <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold flex items-center gap-2">
                                        <span className="h-5 w-5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold flex items-center justify-center border border-border">1</span>
                                        Route
                                    </h4>
                                    <div className="flex items-center gap-3">
                                        <FormField
                                            control={form.control}
                                            name="sourceLocationId"
                                            render={({ field }) => (
                                                <FormItem className="flex-1">
                                                    <FormLabel className="sr-only">From</FormLabel>
                                                    <Select onValueChange={field.onChange} value={field.value}>
                                                        <FormControl>
                                                            <SelectTrigger className="h-10 bg-background border-input">
                                                                <SelectValue placeholder="From..." />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            {locations.map((loc) => (
                                                                <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </FormItem>
                                            )}
                                        />
                                        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-50" />
                                        <FormField
                                            control={form.control}
                                            name="destinationLocationId"
                                            render={({ field }) => (
                                                <FormItem className="flex-1">
                                                    <FormLabel className="sr-only">To</FormLabel>
                                                    <Select onValueChange={field.onChange} value={field.value}>
                                                        <FormControl>
                                                            <SelectTrigger className="h-10 bg-background border-input">
                                                                <SelectValue placeholder="To..." />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            {locations.map((loc) => (
                                                                <SelectItem key={loc.id} value={loc.id} disabled={loc.id === sourceLocationId}>{loc.name}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                </div>

                                {/* Add To Manifest */}
                                <div className={`space-y-4 transition-opacity ${!sourceLocationId ? 'opacity-50 pointer-events-none' : ''}`}>
                                    <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold flex items-center gap-2">
                                        <span className="h-5 w-5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold flex items-center justify-center border border-border">2</span>
                                        Add Product
                                        {sourceLocationId && (
                                            <Badge variant="outline" className="ml-auto text-[10px] h-5 px-1.5 font-normal">{availableProducts.length} Avail</Badge>
                                        )}
                                    </h4>

                                    <div className="space-y-3">
                                        <FormItem>
                                            <ProductCombobox
                                                products={availableProducts}
                                                value={newItem.productVariantId}
                                                onValueChange={(val) => setNewItem(prev => ({ ...prev, productVariantId: val }))}
                                                disabled={!sourceLocationId}
                                                placeholder="Search product..."
                                                className="h-10"
                                            />
                                        </FormItem>

                                        <div className="flex gap-3">
                                            <FormItem className="flex-1">
                                                <div className="relative">
                                                    <Input
                                                        type="number"
                                                        step="1"
                                                        min="1"
                                                        value={newItem.quantity}
                                                        onChange={(e) => setNewItem(prev => ({ ...prev, quantity: e.target.value }))}
                                                        placeholder="Qty"
                                                        className="h-10 bg-background [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                        max={currentSelectedProductMax}
                                                    />
                                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">
                                                        Max: {currentSelectedProductMax}
                                                    </span>
                                                </div>
                                            </FormItem>
                                            <Button
                                                type="button"
                                                onClick={handleAddItem}
                                                disabled={!sourceLocationId || !newItem.productVariantId || !newItem.quantity}
                                                className="h-10 px-4 font-semibold"
                                            >
                                                <Plus className="h-4 w-4 mr-2" />
                                                Add
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* RIGHT COLUMN: MANIFEST (Grey Background for Contrast) */}
                        <div className="flex flex-col h-full bg-muted/5">
                            <div className="px-6 py-4 border-b border-border/50 flex justify-between items-center bg-card/50">
                                <div>
                                    <h3 className="font-semibold text-sm flex items-center gap-2">
                                        <ClipboardList className="h-4 w-4 text-primary" />
                                        Manifest
                                    </h3>
                                    <p className="text-xs text-muted-foreground mt-0.5">Items to be transferred</p>
                                </div>
                                <Badge variant="secondary" className="font-mono font-bold text-xs">{fields.length}</Badge>
                            </div>

                            <div className="flex-1 flex flex-col overflow-hidden min-h-[300px]">
                                {/* Summary Banner */}
                                {(sourceName || destName) && (
                                    <div className="px-6 py-3 bg-muted/20 border-b border-border/40">
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                            <span className="font-medium text-foreground">{sourceName || '...'}</span>
                                            <ArrowRight className="h-3 w-3" />
                                            <span className="font-medium text-foreground">{destName || '...'}</span>
                                        </div>
                                    </div>
                                )}

                                {/* Scrollable List */}
                                <div className="flex-1 overflow-y-auto p-6 space-y-2">
                                    {fields.length === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed border-border/40 rounded-lg p-6">
                                            <Package className="h-8 w-8 mb-2 opacity-20" />
                                            <p className="text-xs font-medium">List is empty</p>
                                        </div>
                                    ) : (
                                        fields.map((field, index) => {
                                            const details = getProductDetails(field.productVariantId);
                                            return (
                                                <div key={field.id} className="flex items-center justify-between p-3 rounded-md bg-card border border-border/60 shadow-sm group">
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-xs font-mono text-muted-foreground w-4">{index + 1}.</span>
                                                        <div>
                                                            <p className="text-sm font-medium text-foreground line-clamp-1">{details.name}</p>
                                                            <p className="text-[10px] text-muted-foreground">{details.sku}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-sm font-bold">{field.quantity}</span>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                                            onClick={() => remove(index)}
                                                        >
                                                            <Trash2 className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>

                                {/* Footer Area */}
                                <div className="p-6 bg-card border-t border-border/50">
                                    <FormField
                                        control={form.control}
                                        name="notes"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormControl>
                                                    <Textarea
                                                        {...field}
                                                        placeholder="Add optional notes..."
                                                        className="resize-none h-20 text-xs bg-muted/20 min-h-0"
                                                    />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />

                                    <Button
                                        type="submit"
                                        disabled={form.formState.isSubmitting || fields.length === 0 || !destinationLocationId}
                                        className="w-full mt-4"
                                    >
                                        {form.formState.isSubmitting ? 'Processing...' : 'Confirm Transfer'}
                                    </Button>

                                    {form.formState.errors.items && (
                                        <p className="text-destructive text-[10px] mt-2 text-center">{form.formState.errors.items.message}</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </form>
        </Form>
    );
}
