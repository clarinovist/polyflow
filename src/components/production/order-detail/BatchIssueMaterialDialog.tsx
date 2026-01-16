'use client';

import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ExtendedProductionOrder } from './types';
import { Location, ProductVariant } from '@prisma/client';
import { batchIssueMaterials } from '@/actions/production';
import { getAvailableBatches } from '@/actions/inventory'; // Added
import { toast } from 'sonner';
import { Plus, Trash2, Package, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BatchSelector } from '@/components/inventory/BatchSelector'; // Added

interface BatchItem {
    id: string; // Internal ID for keys (equals to plannedMaterial.id if isPlanned)
    productVariantId: string;
    quantity: number;
    isPlanned: boolean;
    name: string;
    unit: string;
    isDeletedPlan?: boolean; // If true, we will send this to backend for deletion
    batchId?: string; // Selected Batch ID
}

interface BatchOption {
    id: string;
    batchNumber: string;
    quantity: number;
    manufacturingDate: Date;
    expiryDate?: Date | null;
}

export function BatchIssueMaterialDialog({
    order,
    locations,
    rawMaterials
}: {
    order: ExtendedProductionOrder,
    locations: Location[],
    rawMaterials: ProductVariant[]
}) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [selectedLocation, setSelectedLocation] = useState(order.machine?.locationId || locations[0]?.id);

    // Initial items based on plannedMaterials (NOT BOM icons anymore)
    const initialItems = useMemo(() => {
        const plannedItems = (order.plannedMaterials || []).map((pm) => {
            const issued = order.materialIssues
                .filter((mi) => mi.productVariantId === pm.productVariantId)
                .reduce((sum: number, mi) => sum + Number(mi.quantity), 0);

            const remaining = Math.max(0, Number(pm.quantity) - issued);

            return {
                id: pm.id,
                productVariantId: pm.productVariantId,
                quantity: remaining > 0 ? Number(remaining.toFixed(2)) : 0,
                isPlanned: true,
                name: pm.productVariant.name,
                unit: pm.productVariant.primaryUnit,
                isDeletedPlan: false
            };
        });
        return plannedItems;
    }, [order]);

    const [items, setItems] = useState<BatchItem[]>(initialItems);
    const [batchOptions, setBatchOptions] = useState<Record<string, BatchOption[]>>({}); // Map: productVariantId -> Batches

    // Memoize active variant IDs to avoid unnecessary re-fetches when other item properties (like quantity) change
    const activeVariantIds = useMemo(() =>
        items.map(i => i.productVariantId).filter(Boolean).sort().join(','),
        [items]
    );

    // Fetch batches when component opens or location/variants change
    useEffect(() => {
        if (!open) return;

        const fetchBatches = async () => {
            const variantIds = Array.from(new Set(items.map(i => i.productVariantId).filter(Boolean)));
            const newOptions: Record<string, BatchOption[]> = {};

            await Promise.all(variantIds.map(async (vid) => {
                const batches = await getAvailableBatches(vid, selectedLocation); // Call server action
                // Map to UI interface
                newOptions[vid] = batches.map(b => ({
                    ...b,
                    quantity: Number(b.quantity),
                    // Ensure dates are dates
                    manufacturingDate: new Date(b.manufacturingDate),
                    expiryDate: b.expiryDate ? new Date(b.expiryDate) : null
                }));
            }));

            setBatchOptions(newOptions);
        };

        fetchBatches();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, selectedLocation, activeVariantIds]);


    const handleUpdateBatch = (id: string, batchId: string) => {
        setItems(items.map(item => item.id === id ? { ...item, batchId } : item));
    };

    const handleAddSubstitute = () => {
        const newItem: BatchItem = {
            id: `sub-${Date.now()}`,
            productVariantId: '',
            quantity: 0,
            isPlanned: false,
            name: '',
            unit: ''
        };
        setItems([...items, newItem]);
    };

    const handleToggleDeletePlan = (id: string) => {
        setItems(items.map(item => {
            if (item.id === id && item.isPlanned) {
                return { ...item, isDeletedPlan: !item.isDeletedPlan, quantity: 0 };
            }
            return item;
        }));
    };

    const handleRemoveSubstitute = (id: string) => {
        setItems(items.filter(i => i.id !== id));
    };

    const handleUpdateQty = (id: string, qty: number) => {
        setItems(items.map(item => item.id === id ? { ...item, quantity: qty } : item));
    };

    const handleUpdateVariant = (id: string, variantId: string) => {
        const variant = rawMaterials.find(v => v.id === variantId);
        if (!variant) return;
        setItems(items.map(item => item.id === id ? {
            ...item,
            productVariantId: variantId,
            name: variant.name,
            unit: variant.primaryUnit
        } : item));
    };

    async function onSubmit() {
        // Items to actually consume
        const validConsumptionItems = items.filter(i => !i.isDeletedPlan && i.quantity > 0 && i.productVariantId !== '');

        // Requirements to remove
        const removedPlannedMaterialIds = items.filter(i => i.isPlanned && i.isDeletedPlan).map(i => i.id);

        // Requirements to add (new items that user wants to track)
        // For simplicity, we assume any added substitute with quantity > 0 becomes a requirement IF it's not already there.
        // Actually, let's just send them as consumption + addedPlan.
        const addedPlannedMaterials = items.filter(i => !i.isPlanned && i.quantity > 0 && i.productVariantId !== '').map(i => ({
            productVariantId: i.productVariantId,
            quantity: i.quantity
        }));

        setLoading(true);
        try {
            const result = await batchIssueMaterials({
                productionOrderId: order.id,
                locationId: selectedLocation,
                items: validConsumptionItems.map(i => ({
                    productVariantId: i.productVariantId,
                    quantity: i.quantity
                })),
                removedPlannedMaterialIds,
                addedPlannedMaterials // This makes them "official" requirements for future batches
            });

            if (result.success) {
                toast.success("Materials issued and plan updated");
                setOpen(false);
            } else {
                toast.error(result.error || "Failed to update materials");
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "An unexpected error occurred");
        } finally {
            setLoading(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    <Plus className="w-4 h-4 mr-2" /> Issue Material
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Issue Materials & Update Plan</DialogTitle>
                </DialogHeader>

                <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4 bg-muted/40 p-4 rounded-lg border">
                        <div className="space-y-2">
                            <Label>Source Location</Label>
                            <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-end pb-1 text-sm text-muted-foreground">
                            <AlertCircle className="w-4 h-4 mr-2 text-blue-500" />
                            Editing rows will update the Order Plan permanently.
                        </div>
                    </div>

                    <div className="rounded-md border">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/40 border-b">
                                <tr>
                                    <th className="p-3 text-left font-medium">Material</th>
                                    <th className="p-3 text-right font-medium w-32">Qty to Issue</th>
                                    <th className="p-3 text-center font-medium w-16"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {items.map((item) => (
                                    <tr key={item.id} className={cn(
                                        !item.isPlanned && "bg-amber-500/5",
                                        item.isDeletedPlan && "bg-destructive/5 opacity-60"
                                    )}>
                                        <td className="p-3">
                                            {item.isPlanned ? (
                                                <div className="flex items-center gap-2">
                                                    <Package className="w-4 h-4 text-muted-foreground" />
                                                    <div className="flex flex-col">
                                                        <span className={cn("font-medium", item.isDeletedPlan && "line-through")}>{item.name}</span>
                                                        <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Planned</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="space-y-1">
                                                    <Select value={item.productVariantId} onValueChange={(val) => handleUpdateVariant(item.id, val)}>
                                                        <SelectTrigger className="h-9">
                                                            <SelectValue placeholder="Select substitute..." />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {rawMaterials.map(m => (
                                                                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Substitute</span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-3">
                                            <div className="flex items-center gap-2">
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    disabled={item.isDeletedPlan}
                                                    className="text-right h-9"
                                                    value={item.quantity || ''}
                                                    onChange={(e) => handleUpdateQty(item.id, Number(e.target.value))}
                                                />
                                                <span className="text-slate-500 w-10">{item.unit || '-'}</span>
                                            </div>
                                            {/* Batch Selector */}
                                            <div className="mt-2 w-full">
                                                <BatchSelector
                                                    batches={batchOptions[item.productVariantId] || []}
                                                    selectedBatchId={item.batchId}
                                                    onSelect={(val) => handleUpdateBatch(item.id, val)}
                                                />
                                            </div>
                                        </td>
                                        <td className="p-3 text-center">
                                            {item.isPlanned ? (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className={cn("h-8 w-8", item.isDeletedPlan ? "text-slate-400" : "text-red-500")}
                                                    onClick={() => handleToggleDeletePlan(item.id)}
                                                    title={item.isDeletedPlan ? "Undo Delete" : "Remove Requirement"}
                                                >
                                                    {item.isDeletedPlan ? <Plus className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                                                </Button>
                                            ) : (
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => handleRemoveSubstitute(item.id)}>
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="w-full h-10 rounded-none border-t text-muted-foreground hover:text-foreground hover:bg-muted/50"
                            onClick={handleAddSubstitute}
                        >
                            <Plus className="w-4 h-4 mr-2" /> Add Substitute Material
                        </Button>
                    </div>
                </div>

                <DialogFooter className="mt-6">
                    <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button onClick={onSubmit} disabled={loading} className="bg-primary hover:bg-primary/90">
                        {loading ? "Updating..." : "Save & Update Plan"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
