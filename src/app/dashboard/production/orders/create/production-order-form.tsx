'use client';

import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createProductionOrderSchema, CreateProductionOrderValues } from '@/lib/zod-schemas';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { useState, useMemo, useEffect } from 'react';
import { createProductionOrder, getBomWithInventory } from '@/actions/production';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { z } from 'zod';

interface ProductionOrderFormProps {
    locations: any[];
    boms: (any & { items: any[] })[];
}

interface MaterialRequirement {
    productVariantId: string;
    name: string;
    unit: string;
    stdQty: number;      // Original BOM Qty
    bomOutput: number;   // Original BOM Output
    requiredQty: number; // Calculated
    currentStock: number;
}

// Use schema directly from zod-schemas
const formSchema = createProductionOrderSchema;

type FormValues = z.infer<typeof formSchema>;


export function ProductionOrderForm({ boms, locations }: ProductionOrderFormProps) {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedProductVariantId, setSelectedProductVariantId] = useState<string>('');
    const [isCalculating, setIsCalculating] = useState(false);
    const [hasStockIssues, setHasStockIssues] = useState(false);

    // For storing extra info about materials that isn't in the form state
    const [materialInfo, setMaterialInfo] = useState<Record<string, Omit<MaterialRequirement, 'requiredQty'>>>({});

    // Extract unique products that have BOMs
    const availableProducts = useMemo(() => {
        const products = new Map();
        boms.forEach(bom => {
            if (!products.has(bom.productVariantId)) {
                products.set(bom.productVariantId, {
                    id: bom.productVariantId,
                    name: bom.productVariant.name,
                    unit: bom.productVariant.primaryUnit
                });
            }
        });
        return Array.from(products.values());
    }, [boms]);

    // Filter BOMs based on selected product
    const availableBoms = useMemo(() => {
        if (!selectedProductVariantId) return [];
        return boms.filter(bom => bom.productVariantId === selectedProductVariantId);
    }, [boms, selectedProductVariantId]);

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema) as any,
        defaultValues: {
            plannedQuantity: 0,
            plannedStartDate: new Date(),
            items: [],
        },
    });

    // Materials Array
    const { fields: materialFields, replace: replaceMaterials } = useFieldArray({
        control: form.control,
        name: "items"
    });

    // Flexible BOM Logic
    const watchBomId = form.watch('bomId');
    const watchPlannedQty = form.watch('plannedQuantity');

    // Automated Source Location Selection (Prefer 'rm_warehouse')
    const sourceLocationId = useMemo(() => {
        const rmLoc = locations.find(l => l.slug === 'rm_warehouse');
        return rmLoc ? rmLoc.id : locations[0]?.id || '';
    }, [locations]);

    // Effect to calculate requirements
    useEffect(() => {
        const calculate = async () => {
            if (watchBomId && Number(watchPlannedQty) > 0 && sourceLocationId) {
                setIsCalculating(true);
                const result = await getBomWithInventory(watchBomId, sourceLocationId, Number(watchPlannedQty));
                setIsCalculating(false);

                if (result.success && result.data) {
                    // Update form fields
                    const newItems = result.data.map((item: any) => ({
                        productVariantId: item.productVariantId,
                        quantity: item.requiredQty
                    }));

                    replaceMaterials(newItems);

                    // Store metadata for display
                    const infoMap: Record<string, any> = {};
                    let stockIssues = false;
                    result.data.forEach((item: any) => {
                        infoMap[item.productVariantId] = {
                            name: item.name,
                            unit: item.unit,
                            stdQty: item.stdQty,
                            bomOutput: item.bomOutput,
                            currentStock: item.currentStock
                        };
                        if (item.requiredQty > item.currentStock) {
                            stockIssues = true;
                        }
                    });
                    setMaterialInfo(infoMap);
                    setHasStockIssues(stockIssues);
                } else {
                    toast.error("Failed to calculate recipe", { description: result.error });
                }
            }
        };

        const timer = setTimeout(() => {
            calculate();
        }, 500); // 500ms debounce

        return () => clearTimeout(timer);
    }, [watchBomId, watchPlannedQty, sourceLocationId, replaceMaterials]);

    // Check for stock issues on manual edits
    useEffect(() => {
        const subscription = form.watch((value, { name }) => {
            if (name?.startsWith('items')) {
                let issues = false;
                const items = value.items || [];
                items.forEach((item: any) => {
                    if (!item) return;
                    const info = materialInfo[item.productVariantId];
                    if (info && Number(item.quantity) > info.currentStock) {
                        issues = true;
                    }
                });
                setHasStockIssues(issues);
            }
        });
        return () => subscription.unsubscribe();
    }, [form.watch, materialInfo]);


    // Reset BOM when product changes
    useEffect(() => {
        if (selectedProductVariantId) {
            form.setValue('bomId', '');

            // If there's only one BOM, auto-select it
            const filtered = boms.filter(b => b.productVariantId === selectedProductVariantId);
            if (filtered.length === 1) {
                form.setValue('bomId', filtered[0].id);
            }
        }
    }, [selectedProductVariantId, boms, form]);

    const selectedBom = boms.find(b => b.id === watchBomId);
    const selectedProduct = availableProducts.find(p => p.id === selectedProductVariantId);

    async function onSubmit(data: FormValues) {
        if (hasStockIssues) {
            toast.error("Insufficient Stock", { description: "Cannot create order with insufficient materials." });
            return;
        }

        setIsSubmitting(true);

        const result = await createProductionOrder(data);
        setIsSubmitting(false);

        if (result.success) {
            toast.success("Production Order Created", {
                description: `Order ${result.data?.orderNumber} has been created successfully.`,
            });
            router.push('/dashboard/production/orders');
        } else {
            toast.error("Error", {
                description: result.error || "Something went wrong",
            });
        }
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* Left Column: Specifications & Logistics */}
                    <div className="lg:col-span-2 space-y-6">

                        {/* Card 1: Production Specification */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Production Specification</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Product */}
                                    <FormItem>
                                        <FormLabel>Finished Good (Product)</FormLabel>
                                        <Select
                                            value={selectedProductVariantId}
                                            onValueChange={setSelectedProductVariantId}
                                        >
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select Product" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {availableProducts.map((product) => (
                                                    <SelectItem key={product.id} value={product.id}>
                                                        {product.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormDescription>
                                            Select product to manufacture.
                                        </FormDescription>
                                    </FormItem>

                                    {/* BOM */}
                                    <FormField
                                        control={form.control}
                                        name="bomId"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Bill of Material (Recipe)</FormLabel>
                                                <Select
                                                    onValueChange={field.onChange}
                                                    value={field.value}
                                                    disabled={!selectedProductVariantId}
                                                >
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder={!selectedProductVariantId ? "Select product first" : "Select Recipe"} />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {availableBoms.map((bom) => (
                                                            <SelectItem key={bom.id} value={bom.id}>
                                                                {bom.name} {bom.isDefault ? '(Default)' : ''}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                {selectedBom && (
                                                    <FormDescription>
                                                        Output: {selectedBom.outputQuantity} {selectedBom.productVariant.primaryUnit} / batch
                                                    </FormDescription>
                                                )}
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Quantity */}
                                    <FormField
                                        control={form.control}
                                        name="plannedQuantity"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Planned Quantity</FormLabel>
                                                <FormControl>
                                                    <Input type="number" step="0.01" {...field} />
                                                </FormControl>
                                                <FormDescription>
                                                    Target output in {selectedProduct?.unit || 'Units'}
                                                </FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    {/* Start Date */}
                                    <FormField
                                        control={form.control}
                                        name="plannedStartDate"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-col">
                                                <FormLabel>Start Date</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="date"
                                                        value={field.value ? format(field.value, 'yyyy-MM-dd') : ''}
                                                        onChange={(e) => field.onChange(new Date(e.target.value))}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        {/* Card 2: Logistics & Resources */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Logistics & Resources</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">


                                    {/* Output Location */}
                                    <FormField
                                        control={form.control}
                                        name="locationId"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Output Location (Finished Good)</FormLabel>
                                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Where to store FG?" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {locations.map((loc) => (
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
                                </div>
                            </CardContent>
                        </Card>

                        <div className="flex justify-end gap-4">
                            <Button variant="outline" type="button" onClick={() => router.back()}>Cancel</Button>
                            <Button type="submit" disabled={isSubmitting || hasStockIssues}>
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Create Order
                            </Button>
                        </div>
                    </div>


                    {/* Right Column: Material Requirements (Sticky) */}
                    <div className="lg:col-span-1">
                        <div className="sticky top-6">
                            <Card>
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-base">Material Requirements</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">

                                    <div className="text-xs text-slate-500">
                                        Source: Raw Material Warehouse
                                    </div>

                                    {hasStockIssues && (
                                        <Alert variant="destructive" className="py-2">
                                            <AlertCircle className="h-4 w-4" />
                                            <AlertTitle className="text-sm">Insufficient Stock</AlertTitle>
                                            <AlertDescription className="text-xs">
                                                Check highlighted items.
                                            </AlertDescription>
                                        </Alert>
                                    )}

                                    <div className="border rounded-md overflow-hidden max-h-[500px] overflow-y-auto">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="h-8 text-xs">Item</TableHead>
                                                    <TableHead className="h-8 text-xs w-[80px]">Req</TableHead>
                                                    <TableHead className="h-8 text-xs w-[80px]">Stock</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {materialFields.length === 0 && !isCalculating && (
                                                    <TableRow>
                                                        <TableCell colSpan={3} className="text-center text-slate-400 py-8 text-xs">
                                                            Select product & qty
                                                        </TableCell>
                                                    </TableRow>
                                                )}

                                                {isCalculating && (
                                                    <TableRow>
                                                        <TableCell colSpan={3} className="text-center py-8">
                                                            <Loader2 className="h-4 w-4 animate-spin mx-auto text-slate-400" />
                                                        </TableCell>
                                                    </TableRow>
                                                )}

                                                {materialFields.map((field: any, index) => {
                                                    const info = materialInfo[field.productVariantId];
                                                    const currentQty = Number(form.watch(`items.${index}.quantity`)) || 0;
                                                    const isLowStock = info && currentQty > info.currentStock;

                                                    return (
                                                        <TableRow key={field.id}>
                                                            <TableCell className="py-2">
                                                                <div className="font-medium text-xs">{info?.name || 'Unknown'}</div>
                                                                <div className="text-[10px] text-slate-400">{field.productVariantId.slice(0, 6)}</div>
                                                            </TableCell>
                                                            <TableCell className="py-2">
                                                                <div className="flex flex-col items-end gap-1">
                                                                    <Input
                                                                        {...form.register(`items.${index}.quantity`, { valueAsNumber: true })}
                                                                        type="number"
                                                                        step="0.001"
                                                                        className="h-6 w-16 text-right text-xs px-1"
                                                                    />
                                                                    <span className="text-[10px] text-slate-400">{info?.unit}</span>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="py-2">
                                                                <div className="flex flex-col items-end">
                                                                    <span className={`text-xs ${isLowStock ? 'text-red-600 font-bold' : ''}`}>
                                                                        {info?.currentStock ?? 0}
                                                                    </span>
                                                                    {isLowStock && (
                                                                        <span className="text-[10px] text-red-500 font-medium">Low</span>
                                                                    )}
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })}
                                            </TableBody>
                                        </Table>
                                    </div>

                                </CardContent>
                            </Card>
                        </div>
                    </div>

                </div>
            </form>
        </Form>
    );
}
