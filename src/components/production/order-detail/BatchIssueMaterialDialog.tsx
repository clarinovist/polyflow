import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ExtendedProductionOrder } from './types';
import { Location, ProductVariant } from '@prisma/client';
import { batchIssueMaterials } from '@/actions/production';
import { transferStockBulk } from '@/actions/inventory';
import { toast } from 'sonner';
import { Plus, Trash2, Package, AlertCircle, ArrowRightLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BatchItem {
    id: string; // Internal ID for keys (equals to plannedMaterial.id if isPlanned)
    productVariantId: string;
    quantity: number;
    isPlanned: boolean;
    name: string;
    unit: string;
    isDeletedPlan?: boolean; // If true, we will send this to backend for deletion
    originalQuantity: number; // For restoring on undo-delete
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
    const router = useRouter();

    // Check if mixing based on machine type OR bom name OR order number
    const isMixing = order.machine?.type === 'MIXER' ||
        (order.bom?.name || '').toLowerCase().includes('mix') ||
        (order.orderNumber || '').includes('MIX');

    // Initial items based on plannedMaterials
    const initialItems = useMemo(() => {
        const plannedItems = (order.plannedMaterials || []).map((pm) => {
            const issued = order.materialIssues
                .filter((mi) => mi.productVariantId === pm.productVariantId)
                .reduce((sum: number, mi) => sum + Number(mi.quantity), 0);

            const remaining = Math.max(0, Number(pm.quantity) - issued);
            // Default to remaining if > 0, otherwise 0
            const quantityNum = remaining > 0 ? Number(remaining.toFixed(2)) : 0;

            return {
                id: pm.id,
                productVariantId: pm.productVariantId,
                quantity: quantityNum,
                isPlanned: true,
                name: pm.productVariant.name,
                unit: pm.productVariant.primaryUnit,
                isDeletedPlan: false,
                originalQuantity: quantityNum
            };
        });
        return plannedItems;
    }, [order]);

    const [items, setItems] = useState<BatchItem[]>(initialItems);

    const handleAddSubstitute = () => {
        const newItem: BatchItem = {
            id: `sub-${Date.now()}`,
            productVariantId: '',
            quantity: 0,
            isPlanned: false,
            name: '',
            unit: '',
            originalQuantity: 0
        };
        setItems([...items, newItem]);
    };

    const handleToggleDeletePlan = (id: string) => {
        setItems(items.map(item => {
            if (item.id === id && item.isPlanned) {
                const newIsDeleted = !item.isDeletedPlan;
                return {
                    ...item,
                    isDeletedPlan: newIsDeleted,
                    quantity: newIsDeleted ? 0 : item.originalQuantity
                };
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
        const validItems = items.filter(i => !i.isDeletedPlan && i.quantity > 0 && i.productVariantId !== '');

        if (validItems.length === 0) {
            toast.error("No items to process");
            return;
        }

        setLoading(true);
        try {
            if (isMixing) {
                if (selectedLocation === order.location.id) {
                    toast.error("Source and destination locations must be different for transfer.");
                    setLoading(false);
                    return;
                }
                // MIXING MODE: Transfer Stock Logic
                const itemsToTransfer = validItems.map(i => ({
                    productVariantId: i.productVariantId,
                    quantity: i.quantity
                }));

                const result = await transferStockBulk({
                    sourceLocationId: selectedLocation,
                    destinationLocationId: order.location.id, // Target is the Production Location
                    items: itemsToTransfer,
                    date: new Date(),
                    notes: `Transfer for Mixing Order ${order.orderNumber}`
                });

                if (result.success) {
                    toast.success(`Successfully transferred materials to ${order.location.name}`);
                    setOpen(false);
                    router.refresh();
                } else {
                    toast.error(result.error || "Failed to transfer materials");
                }
            } else {
                // STANDARD MODE: Issue Logic
                const removedPlannedMaterialIds = items.filter(i => i.isPlanned && i.isDeletedPlan).map(i => i.id);
                const addedPlannedMaterials = items.filter(i => !i.isPlanned && i.quantity > 0 && i.productVariantId !== '').map(i => ({
                    productVariantId: i.productVariantId,
                    quantity: i.quantity
                }));

                const result = await batchIssueMaterials({
                    productionOrderId: order.id,
                    locationId: selectedLocation,
                    items: validItems.map(i => ({
                        productVariantId: i.productVariantId,
                        quantity: i.quantity
                    })),
                    removedPlannedMaterialIds,
                    addedPlannedMaterials,
                    requestId: `REQ-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
                });

                if (result.success) {
                    toast.success("Materials issued and plan updated");
                    setOpen(false);
                    router.refresh();
                } else {
                    toast.error(result.error || "Failed to update materials");
                }
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
                    {isMixing ? <ArrowRightLeft className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                    {isMixing ? "Transfer Material" : "Issue Material"}
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>{isMixing ? "Transfer Materials to Mixing Area" : "Issue Materials & Update Plan"}</DialogTitle>
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
                        <div className="flex items-end pb-1 text-sm text-center">
                            {isMixing ? (
                                <div className="text-amber-600 flex items-center bg-amber-50 p-2 rounded w-full">
                                    <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
                                    <span className="text-xs text-left">
                                        Items will be <b>MOVED</b> to <b>{order.location.name}</b>.
                                        Stock will be consumed automatically when you Record Output (Backflush).
                                        {!order.location.name.toLowerCase().includes('production') && !order.location.name.toLowerCase().includes('staging') && (
                                            <div className="mt-1 font-bold text-red-600">
                                                Warning: Target is likely a Warehouse. Ensure this Order is set to a Production Location.
                                            </div>
                                        )}
                                    </span>
                                </div>
                            ) : (
                                <div className="text-muted-foreground flex items-center w-full">
                                    <AlertCircle className="w-4 h-4 mr-2 text-blue-500 flex-shrink-0" />
                                    <span className="text-xs text-left">
                                        Editing rows will update the Order Plan permanently.
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="rounded-md border">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/40 border-b">
                                <tr>
                                    <th className="p-3 text-left font-medium">Material</th>
                                    <th className="p-3 text-right font-medium w-32">{isMixing ? "Qty to Transfer" : "Qty to Issue"}</th>
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
                                                        <span className={cn("font-medium text-foreground", item.isDeletedPlan && "line-through")}>{item.name}</span>
                                                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Planned</span>
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
                                                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Substitute</span>
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
                                                <span className="text-muted-foreground w-10 text-xs font-bold">{item.unit || '-'}</span>
                                            </div>
                                            {!isMixing && (
                                                <div className="mt-1">
                                                    <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-tight">Auto-FIFO Active</span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-3 text-center">
                                            {item.isPlanned ? (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className={cn(
                                                        "h-8 w-8 transition-colors",
                                                        item.isDeletedPlan
                                                            ? "text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                                                            : "text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30"
                                                    )}
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
                        {loading ? "Processing..." : (isMixing ? "Move Stock to Mixing" : "Save & Update Plan")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
