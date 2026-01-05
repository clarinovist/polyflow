'use client';

import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createProductionOrderSchema, CreateProductionOrderValues } from '@/lib/zod-schemas';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, AlertCircle, Trash2, PlusCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { useState, useMemo, useEffect } from 'react';
import { createProductionOrder, getBomWithInventory } from '@/actions/production';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { z } from 'zod';

interface ProductionOrderFormProps {
    machines: any[];
    locations: any[];
    operators: any[];
    boms: (any & { items: any[] })[];
    helpers?: any[];
    workShifts?: any[];
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

// ----------------------------------------------------------------------
// 1. Frontend Specific Schema for UI Logic
// ----------------------------------------------------------------------
const teamMemberSchema = z.object({
    operatorId: z.string().min(1, "Member is required"),
    role: z.enum(['LEAD', 'HELPER', 'PACKER']),
});

// Extend/Modify the base schema for the form state only
const formSchema = createProductionOrderSchema.omit({ initialShift: true }).extend({
    initialShift: z.object({
        shiftName: z.string().min(1, "Shift name is required"),
        startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format"),
        endTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format"),
        teamMembers: z.array(teamMemberSchema)
            .min(1, "At least one team member is required")
            .refine((members) => {
                const leads = members.filter(m => m.role === 'LEAD');
                return leads.length === 1;
            }, {
                message: "Exactly one LEAD Operator is required.",
            })
            .refine((members) => {
                const ids = members.map(m => m.operatorId);
                return new Set(ids).size === ids.length;
            }, {
                message: "Duplicate team members are not allowed.",
            })
    }).optional(),
});

type FormValues = z.infer<typeof formSchema>;


export function ProductionOrderForm({ boms, machines, locations, operators, helpers, workShifts = [] }: ProductionOrderFormProps) {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedProductVariantId, setSelectedProductVariantId] = useState<string>('');
    const [isCalculating, setIsCalculating] = useState(false);
    const [hasStockIssues, setHasStockIssues] = useState(false);

    // Combine operators and helpers for the dropdown
    const allStaff = useMemo(() => {
        // Create a map to ensure uniqueness by ID
        const staffMap = new Map();

        // Add operators
        operators.forEach(op => staffMap.set(op.id, op));

        // Add helpers if available
        if (helpers) {
            helpers.forEach(helper => staffMap.set(helper.id, helper));
        }

        return Array.from(staffMap.values());
    }, [operators, helpers]);

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

    const form = useForm({
        resolver: zodResolver(formSchema), // Use our new UI schema
        defaultValues: {
            plannedQuantity: 0,
            plannedStartDate: new Date(),
            items: [],
            initialShift: {
                shiftName: '',
                startTime: '08:00',
                endTime: '16:00',
                teamMembers: [
                    { operatorId: '', role: 'LEAD' } // Default Row 1: Empty LEAD
                ]
            }
        } as any,
    });

    // Materials Array
    const { fields: materialFields, replace: replaceMaterials } = useFieldArray({
        control: form.control,
        name: "items"
    });

    // Team Array
    const { fields: teamFields, append: appendTeam, remove: removeTeam } = useFieldArray({
        control: form.control,
        name: "initialShift.teamMembers"
    });

    // Helper to get selected operators to disable them in other rows
    const selectedOperatorIds = form.watch('initialShift.teamMembers')?.map((m: any) => m.operatorId) || [];

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

        // ----------------------------------------------------------------------
        // 2. Data Transformation (UI -> Backend)
        // ----------------------------------------------------------------------
        let submissionData: CreateProductionOrderValues = {
            ...data,
            items: data.items, // Explicitly pass items
            initialShift: undefined // Rebuild this
        };

        if (data.initialShift) {
            const lead = data.initialShift.teamMembers.find(m => m.role === 'LEAD');
            // Helpers are anyone NOT lead (includes PACKER, HELPER)
            const helpers = data.initialShift.teamMembers
                .filter(m => m.role !== 'LEAD')
                .map(m => m.operatorId);

            if (!lead) {
                // Should be caught by Zod, but double check
                toast.error("Validation Error", { description: "No Lead Operator assigned." });
                setIsSubmitting(false);
                return;
            }

            submissionData.initialShift = {
                shiftName: data.initialShift.shiftName,
                startTime: data.initialShift.startTime,
                endTime: data.initialShift.endTime,
                operatorId: lead.operatorId,
                helperIds: helpers
            };
        }

        const result = await createProductionOrder(submissionData);
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

                <div className="space-y-6">
                    {/* Primary Selection */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                        {/* Step 1: Select Product */}
                        <FormItem>
                            <FormLabel>Finished Good (Product)</FormLabel>
                            <Select
                                value={selectedProductVariantId}
                                onValueChange={setSelectedProductVariantId}
                            >
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select Product to Manufacture" />
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
                                Products with active recipes.
                            </FormDescription>
                        </FormItem>

                        {/* Step 2: Select BOM */}
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
                                                <SelectValue placeholder={!selectedProductVariantId ? "Select a product first" : "Select Recipe Version"} />
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
                                            Output: {selectedBom.outputQuantity} {selectedBom.productVariant.primaryUnit} per batch
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

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Machine */}
                        <FormField
                            control={form.control}
                            name="machineId"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Assigned Machine</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select a machine" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {machines.map((machine) => (
                                                <SelectItem key={machine.id} value={machine.id}>
                                                    {machine.name} ({machine.code})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

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
                </div>

                <div className="space-y-4 pt-6 border-t">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold">Material Requirements</h3>
                        {/* Hidden Source Location display to reassure user or debug */}
                        <span className="text-sm text-slate-400">
                            Source: Raw Material Warehouse
                        </span>
                    </div>

                    <p className="text-sm text-slate-500">
                        Based on the recipe and planned quantity. Adjust if necessary.
                    </p>

                    {hasStockIssues && (
                        <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>Insufficient Stock</AlertTitle>
                            <AlertDescription>
                                You cannot proceed because some items have insufficient stock in the Raw Material Warehouse.
                            </AlertDescription>
                        </Alert>
                    )}

                    {/* Material Table */}
                    <div className="border rounded-md overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Ingredient</TableHead>
                                    <TableHead>Std Ratio</TableHead>
                                    <TableHead className="w-[150px]">Required Qty</TableHead>
                                    <TableHead>Current Stock</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {materialFields.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center text-slate-500 py-6">
                                            Select a Recipe and Quantity to calculate materials.
                                        </TableCell>
                                    </TableRow>
                                )}

                                {isCalculating && materialFields.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center py-6">
                                            <div className="flex items-center justify-center gap-2 text-slate-500">
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                Calculating...
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}

                                {materialFields.map((field: any, index) => {
                                    const info = materialInfo[field.productVariantId];
                                    const currentQty = form.watch(`items.${index}.quantity`);
                                    const isLowStock = info && currentQty > info.currentStock;

                                    return (
                                        <TableRow key={field.id}>
                                            <TableCell>
                                                <div className="font-medium">{info?.name || 'Unknown Item'}</div>
                                                <div className="text-xs text-slate-500">{field.productVariantId.slice(0, 8)}...</div>
                                            </TableCell>
                                            <TableCell className="text-xs text-slate-500">
                                                {info ? `${info.stdQty} / ${info.bomOutput} ${selectedProduct?.unit}` : '-'}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <FormField
                                                        control={form.control}
                                                        name={`items.${index}.quantity`}
                                                        render={({ field }) => (
                                                            <Input
                                                                {...field}
                                                                type="number"
                                                                step="0.001"
                                                                className="h-8 w-24 text-right"
                                                                onChange={(e) => field.onChange(Number(e.target.value))}
                                                            />
                                                        )}
                                                    />
                                                    <span className="text-sm text-slate-500">{info?.unit}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col gap-1">
                                                    <span className={`text-sm ${isLowStock ? 'text-red-600 font-bold' : ''}`}>
                                                        {info?.currentStock ?? 0} {info?.unit}
                                                    </span>
                                                    {isLowStock && (
                                                        <Badge variant="destructive" className="w-fit text-[10px] h-5 px-1">
                                                            Low Stock
                                                        </Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>

                    <div className="flex items-center gap-2 pt-4">
                        <h3 className="text-lg font-semibold">Initial Shift Assignment (Optional)</h3>
                    </div>

                    {/* Shift Selection */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <FormLabel className="text-sm font-medium">Shift <span className="text-red-500">*</span></FormLabel>
                            <Select onValueChange={(val) => {
                                const shift = workShifts?.find(s => s.id === val);
                                if (shift) {
                                    // Set hidden shiftName and auto-fill times
                                    form.setValue('initialShift.shiftName', shift.name);
                                    form.setValue('initialShift.startTime', shift.startTime);
                                    form.setValue('initialShift.endTime', shift.endTime);
                                }
                            }}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select Shift" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {workShifts?.filter(s => s.status === 'ACTIVE').map((shift) => (
                                        <SelectItem key={shift.id} value={shift.id}>
                                            {shift.name} ({shift.startTime} - {shift.endTime})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {/* Hidden field to store shiftName for backend compatibility */}
                            <FormField
                                control={form.control}
                                name="initialShift.shiftName"
                                render={({ field }) => (
                                    <input type="hidden" {...field} />
                                )}
                            />
                            <FormMessage>{(form.formState.errors.initialShift as any)?.shiftName?.message}</FormMessage>
                        </div>
                        <div className='hidden md:block' /> {/* Spacer */}

                        {/* Start Time */}
                        <FormField
                            control={form.control}
                            name="initialShift.startTime"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Start Time (24h)</FormLabel>
                                    <div className="relative">
                                        <FormControl>
                                            <Input
                                                type="text"
                                                placeholder="HH:mm"
                                                maxLength={5}
                                                className="pr-10"
                                                {...field}
                                            />
                                        </FormControl>
                                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-500">
                                            <Clock className="h-4 w-4" />
                                        </div>
                                    </div>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {/* End Time */}
                        <FormField
                            control={form.control}
                            name="initialShift.endTime"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>End Time (24h)</FormLabel>
                                    <div className="relative">
                                        <FormControl>
                                            <Input
                                                type="text"
                                                placeholder="HH:mm"
                                                maxLength={5}
                                                className="pr-10"
                                                {...field}
                                            />
                                        </FormControl>
                                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-500">
                                            <Clock className="h-4 w-4" />
                                        </div>
                                    </div>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>

                    {/* Unified Team Table */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h4 className="text-sm font-medium">Team Members</h4>
                            <div className="text-xs text-slate-500">
                                {(form.formState.errors.initialShift as any)?.teamMembers?.root?.message ||
                                    (form.formState.errors.initialShift as any)?.teamMembers?.message}
                            </div>
                        </div>

                        <div className="border rounded-md">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Operator / Helper</TableHead>
                                        <TableHead className="w-[180px]">Role</TableHead>
                                        <TableHead className="w-[80px]"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {teamFields.map((field, index) => {
                                        const currentOperator = form.watch(`initialShift.teamMembers.${index}.operatorId`);

                                        return (
                                            <TableRow key={field.id}>
                                                <TableCell>
                                                    <FormField
                                                        control={form.control}
                                                        name={`initialShift.teamMembers.${index}.operatorId`}
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <Select
                                                                    onValueChange={field.onChange}
                                                                    value={field.value}
                                                                >
                                                                    <FormControl>
                                                                        <SelectTrigger>
                                                                            <SelectValue placeholder="Select Member" />
                                                                        </SelectTrigger>
                                                                    </FormControl>
                                                                    <SelectContent>
                                                                        {allStaff.map((person) => {
                                                                            // Disable if selected in ANOTHER row
                                                                            const isSelected = selectedOperatorIds.includes(person.id);
                                                                            const isCurrent = person.id === currentOperator;

                                                                            return (
                                                                                <SelectItem
                                                                                    key={person.id}
                                                                                    value={person.id}
                                                                                    disabled={isSelected && !isCurrent}
                                                                                >
                                                                                    {person.name}
                                                                                </SelectItem>
                                                                            );
                                                                        })}
                                                                    </SelectContent>
                                                                </Select>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <FormField
                                                        control={form.control}
                                                        name={`initialShift.teamMembers.${index}.role`}
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <Select
                                                                    onValueChange={field.onChange}
                                                                    value={field.value}
                                                                >
                                                                    <FormControl>
                                                                        <SelectTrigger>
                                                                            <SelectValue />
                                                                        </SelectTrigger>
                                                                    </FormControl>
                                                                    <SelectContent>
                                                                        <SelectItem value="LEAD">Lead Operator</SelectItem>
                                                                        <SelectItem value="HELPER">Helper</SelectItem>
                                                                        <SelectItem value="PACKER">Packer</SelectItem>
                                                                    </SelectContent>
                                                                </Select>
                                                            </FormItem>
                                                        )}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        type="button"
                                                        onClick={() => removeTeam(index)}
                                                        disabled={teamFields.length <= 1} // Prevent removing last row
                                                    >
                                                        <Trash2 className="h-4 w-4 text-slate-500 hover:text-red-600" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>

                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full border-dashed"
                            onClick={() => appendTeam({ operatorId: '', role: 'HELPER' })}
                        >
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Add Team Member
                        </Button>
                    </div>
                </div>

                <div className="flex justify-end gap-4">
                    <Button variant="outline" type="button" onClick={() => router.back()}>Cancel</Button>
                    <Button type="submit" disabled={isSubmitting || hasStockIssues}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Create Order
                    </Button>
                </div>
            </form>
        </Form>
    );
}
