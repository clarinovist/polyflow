'use client';

import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createProductionOrderSchema } from '@/lib/zod-schemas';
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

// Helper for generating order number outside of component to satisfy React Compiler purity rules
function generateOrderNumber(processType: string) {
    const dateStr = format(new Date(), 'yyMMdd');
    const typeCode = processType === 'mixing' ? 'MIX' : processType === 'extrusion' ? 'EXT' : 'PCK';
    const randomDigits = String(Math.floor(Math.random() * 99) + 1).padStart(2, '0');
    return `PO-${dateStr}-${typeCode}${randomDigits}`;
}

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { z } from 'zod';

export interface ProductionOrderFormProps {
    locations: { id: string; slug: string; name: string }[];
    boms: {
        id: string;
        name: string;
        isDefault: boolean;
        productVariantId: string;
        outputQuantity: number;
        productVariant: {
            name: string;
            primaryUnit: string;
            product: {
                productType: string;
            };
        };
        items: {
            productVariantId: string;
            quantity: number;
        }[];
    }[];
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
    const [processType, setProcessType] = useState<'mixing' | 'extrusion' | 'packing'>('mixing');
    const [selectedProductVariantId, setSelectedProductVariantId] = useState<string>('');
    const [isCalculating, setIsCalculating] = useState(false);

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
                    unit: bom.productVariant.primaryUnit,
                    productType: bom.productVariant.product.productType
                });
            }
        });

        const allProducts = Array.from(products.values());

        // Filter based on Process Type
        return allProducts.filter(p => {
            if (processType === 'mixing') return p.productType === 'INTERMEDIATE';
            if (processType === 'extrusion') return p.productType === 'FINISHED_GOOD';
            if (processType === 'packing') return p.productType === 'FINISHED_GOOD';
            return true;
        });
    }, [boms, processType]);

    // Filter BOMs based on selected product
    const availableBoms = useMemo(() => {
        if (!selectedProductVariantId) return [];
        return boms.filter(bom => bom.productVariantId === selectedProductVariantId);
    }, [boms, selectedProductVariantId]);

    const form = useForm<FormValues>({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resolver: zodResolver(formSchema) as any,
        defaultValues: {
            plannedQuantity: 0,
            plannedStartDate: new Date(),
            items: [],
            locationId: '',
            bomId: '',
            notes: '',
        },
    });

    // Materials Array
    const { fields: materialFields, replace: replaceMaterials } = useFieldArray({
        control: form.control,
        name: "items"
    });

    // Flexible BOM Logic
    const watchBomId = useWatch({ control: form.control, name: 'bomId' });
    const watchPlannedQty = useWatch({ control: form.control, name: 'plannedQuantity' });
    const watchItems = useWatch({ control: form.control, name: 'items' });

    const [planningMode, setPlanningMode] = useState<'weight' | 'batch'>('weight');
    const [batchCount, setBatchCount] = useState<number>(1);

    // Update Planned Qty when Batch Count or BOM changes in Batch Mode
    useEffect(() => {
        if (planningMode === 'batch' && watchBomId) {
            const bom = boms.find(b => b.id === watchBomId);
            if (bom) {
                const totalQty = Number(bom.outputQuantity) * batchCount;
                form.setValue('plannedQuantity', totalQty);
            }
        }
    }, [planningMode, batchCount, watchBomId, boms, form]);

    // Automated Source Location Selection
    const sourceLocationId = useMemo(() => {
        const rmLoc = locations.find(l => l.slug === 'rm_warehouse');
        const mixingLoc = locations.find(l => l.slug === 'mixing_warehouse');
        const fgLoc = locations.find(l => l.slug === 'fg_warehouse');
        if (processType === 'mixing') return rmLoc?.id || '';
        if (processType === 'extrusion') return mixingLoc?.id || '';
        if (processType === 'packing') return fgLoc?.id || '';
        return '';
    }, [processType, locations]);



    // Effect to calculate requirements
    useEffect(() => {
        const calculate = async () => {
            if (watchBomId && Number(watchPlannedQty) > 0 && sourceLocationId) {
                setIsCalculating(true);
                const result = await getBomWithInventory(watchBomId, sourceLocationId, Number(watchPlannedQty));
                setIsCalculating(false);

                if (result.success && result.data) {
                    // Update form fields
                    const newItems = (result.data as MaterialRequirement[]).map((item) => ({
                        productVariantId: item.productVariantId,
                        quantity: item.requiredQty
                    }));

                    replaceMaterials(newItems);

                    // Store metadata for display
                    const infoMap: Record<string, Omit<MaterialRequirement, 'requiredQty'>> = {};
                    (result.data as MaterialRequirement[]).forEach((item) => {
                        infoMap[item.productVariantId] = {
                            productVariantId: item.productVariantId,
                            name: item.name,
                            unit: item.unit,
                            stdQty: item.stdQty,
                            bomOutput: item.bomOutput,
                            currentStock: item.currentStock
                        };
                    });
                    setMaterialInfo(infoMap);
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
    const hasStockIssues = useMemo(() => {
        let issues = false;
        const items = watchItems || [];
        items.forEach((item) => {
            if (!item) return;
            const info = materialInfo[item.productVariantId as string];
            if (info && Number(item.quantity) > info.currentStock) {
                issues = true;
            }
        });
        return issues;
    }, [watchItems, materialInfo]);


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

    // Smart Location Logic for target location (managed by Hook Form)
    useEffect(() => {
        const mixingLoc = locations.find(l => l.slug === 'mixing_warehouse');
        const fgLoc = locations.find(l => l.slug === 'fg_warehouse');

        if (processType === 'mixing') {
            if (mixingLoc) form.setValue('locationId', mixingLoc.id);
        } else if (processType === 'extrusion' || processType === 'packing') {
            if (fgLoc) form.setValue('locationId', fgLoc.id);
        }
    }, [processType, locations, form]);

    const selectedBom = boms.find(b => b.id === watchBomId);

    async function onSubmit(data: FormValues) {
        if (hasStockIssues) {
            toast.error("Insufficient Stock", { description: "Cannot create order with insufficient materials." });
            return;
        }

        setIsSubmitting(true);
        try {
            const orderNumber = generateOrderNumber(processType);

            const response = await createProductionOrder({
                ...data,
                orderNumber, // Inject the generated number
                locationId: data.locationId, // Ensure hidden field value is passed
                plannedQuantity: planningMode === 'batch' && selectedBom
                    ? batchCount * Number(selectedBom.outputQuantity)
                    : data.plannedQuantity
            });

            setIsSubmitting(false);

            if (response.success) {
                toast.success("Production Order Created", {
                    description: `Order ${response.data?.orderNumber} has been created successfully.`,
                });
                router.push('/dashboard/production/orders');
            } else {
                toast.error("Error", {
                    description: response.error || "Something went wrong",
                });
            }
        } catch {
            setIsSubmitting(false);
            toast.error("Error", {
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

                                {/* Stage Selection */}
                                <div className="space-y-3">
                                    <FormLabel>Production Stage</FormLabel>
                                    <div className="flex rounded-md shadow-sm">
                                        <Button
                                            type="button"
                                            variant={processType === 'mixing' ? 'default' : 'outline'}
                                            className="rounded-r-none h-9 flex-1 text-xs"
                                            onClick={() => {
                                                setProcessType('mixing');
                                                setSelectedProductVariantId('');
                                                form.setValue('items', []);
                                                form.setValue('bomId', '');
                                                form.setValue('plannedQuantity', 0);
                                                setMaterialInfo({});
                                            }}
                                        >
                                            Mixing
                                        </Button>
                                        <Button
                                            type="button"
                                            variant={processType === 'extrusion' ? 'default' : 'outline'}
                                            className="rounded-none h-9 flex-1 text-xs border-l-0"
                                            onClick={() => {
                                                setProcessType('extrusion');
                                                setSelectedProductVariantId('');
                                                form.setValue('items', []);
                                                form.setValue('bomId', '');
                                                form.setValue('plannedQuantity', 0);
                                                setMaterialInfo({});
                                            }}
                                        >
                                            Extrusion
                                        </Button>
                                        <Button
                                            type="button"
                                            variant={processType === 'packing' ? 'default' : 'outline'}
                                            className="rounded-l-none h-9 flex-1 text-xs border-l-0"
                                            onClick={() => {
                                                setProcessType('packing');
                                                setSelectedProductVariantId('');
                                                form.setValue('items', []);
                                                form.setValue('bomId', '');
                                                form.setValue('plannedQuantity', 0);
                                                setMaterialInfo({});
                                            }}
                                        >
                                            Packing
                                        </Button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Product */}
                                    <FormItem>
                                        <FormLabel>Product</FormLabel>
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
                                    </FormItem>

                                    {/* BOM */}
                                    <FormField
                                        control={form.control}
                                        name="bomId"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Recipe</FormLabel>
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
                                    {/* Quantity Section */}
                                    <div className="space-y-3">
                                        <FormLabel>Planning Method</FormLabel>
                                        <div className="flex rounded-md shadow-sm">
                                            <Button
                                                type="button"
                                                variant={planningMode === 'weight' ? 'default' : 'outline'}
                                                className="rounded-r-none h-9 flex-1 text-xs"
                                                onClick={() => setPlanningMode('weight')}
                                            >
                                                By Weight
                                            </Button>
                                            <Button
                                                type="button"
                                                variant={planningMode === 'batch' ? 'default' : 'outline'}
                                                className="rounded-l-none h-9 flex-1 text-xs"
                                                onClick={() => setPlanningMode('batch')}
                                            >
                                                By Batch
                                            </Button>
                                        </div>

                                        {planningMode === 'batch' ? (
                                            <FormItem>
                                                <FormLabel>Total Batches</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="number"
                                                        value={batchCount.toString()}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            if (val === '') {
                                                                setBatchCount(0); // or handle as needed
                                                            } else {
                                                                setBatchCount(Number(val));
                                                            }
                                                        }}
                                                        min={1}
                                                    />
                                                </FormControl>
                                                <FormDescription>
                                                    {selectedBom ? `${batchCount} x ${selectedBom.outputQuantity} = ${Number(selectedBom.outputQuantity) * batchCount} ${selectedBom.productVariant.primaryUnit}` : 'Select Recipe first'}
                                                </FormDescription>
                                            </FormItem>
                                        ) : (
                                            <FormField
                                                control={form.control}
                                                name="plannedQuantity"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Target Weight</FormLabel>
                                                        <FormControl>
                                                            <Input type="number" step="0.01" {...field} />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        )}
                                    </div>

                                    {/* Hidden Planned Qty Display for Batch Mode to Ensure Form Submission Works */}
                                    {planningMode === 'batch' && (
                                        <FormField
                                            control={form.control}
                                            name="plannedQuantity"
                                            render={({ field }) => (
                                                <FormItem className="hidden">
                                                    <FormControl>
                                                        <Input {...field} />
                                                    </FormControl>
                                                </FormItem>
                                            )}
                                        />
                                    )}

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

                                {/* Notes Field */}
                                <FormField
                                    control={form.control}
                                    name="notes"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Notes</FormLabel>
                                            <FormControl>
                                                <Textarea
                                                    placeholder="Add any specific instructions..."
                                                    className="resize-none"
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </CardContent>
                        </Card>

                        <div className="flex justify-end gap-4">
                            <Button variant="outline" type="button" onClick={() => router.back()}>Cancel</Button>
                            <Button type="submit" disabled={isSubmitting || hasStockIssues}>
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Create Order
                            </Button>
                        </div>

                        {/* Hidden Fields for Logic */}
                        <FormField
                            control={form.control}
                            name="locationId"
                            render={({ field }) => (
                                <FormItem className="hidden">
                                    <FormControl>
                                        <Input {...field} />
                                    </FormControl>
                                </FormItem>
                            )}
                        />
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
                                        Source: {locations.find(l => l.id === sourceLocationId)?.name || 'Unknown'}
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

                                    <div className="border rounded-md overflow-hidden max-h-[75vh] overflow-y-auto">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="h-8 text-xs">Item</TableHead>
                                                    <TableHead className="h-8 text-xs w-[80px] text-right">Req</TableHead>
                                                    <TableHead className="h-8 text-xs w-[80px] text-right">Stock</TableHead>
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

                                                {materialFields.map((field, index) => {
                                                    const info = materialInfo[field.productVariantId];
                                                    const currentQty = Number(watchItems?.[index]?.quantity) || 0;
                                                    const isLowStock = info && currentQty > info.currentStock;

                                                    return (
                                                        <TableRow key={field.id}>
                                                            <TableCell className="py-2">
                                                                <div className="font-medium text-xs">{info?.name || 'Unknown'}</div>
                                                                <div className="text-[10px] text-slate-400">{field.productVariantId.slice(0, 6)}</div>
                                                            </TableCell>
                                                            <TableCell className="py-2 text-right">
                                                                <div className="flex flex-col items-end gap-1">
                                                                    <span className="text-xs font-semibold">
                                                                        {Number(currentQty).toFixed(2)}
                                                                    </span>
                                                                    <span className="text-[10px] text-slate-400">{info?.unit}</span>
                                                                    {/* Hidden Input to maintain form registration */}
                                                                    <input
                                                                        type="hidden"
                                                                        {...form.register(`items.${index}.quantity`, { valueAsNumber: true })}
                                                                    />
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="py-2 text-right">
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
        </Form >
    );
}
