'use client';

import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ShoppingCart, AlertCircle, Plus, Minus } from 'lucide-react';
import { toast } from 'sonner';
import { createManualPurchaseRequest } from '@/actions/purchasing';
import { ExtendedProductionOrder } from './types';

interface ManualProcurementDialogProps {
    order: ExtendedProductionOrder;
}

export function ManualProcurementDialog({ order }: ManualProcurementDialogProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    // Initialize quantities based on planned materials
    const [items, setItems] = useState(
        order.plannedMaterials.map(pm => ({
            productVariantId: pm.productVariantId,
            name: pm.productVariant.name,
            skuCode: pm.productVariant.skuCode,
            unit: pm.productVariant.primaryUnit,
            plannedQty: Number(pm.quantity),
            procureQty: 0,
            selected: false
        }))
    );

    const [priority, setPriority] = useState<'NORMAL' | 'URGENT'>('NORMAL');
    const [notes, setNotes] = useState(`Manual procurement for WO ${order.orderNumber}`);

    const handleToggleSelect = (index: number) => {
        const newItems = [...items];
        newItems[index].selected = !newItems[index].selected;
        if (newItems[index].selected && newItems[index].procureQty === 0) {
            newItems[index].procureQty = newItems[index].plannedQty;
        }
        setItems(newItems);
    };

    const handleQtyChange = (index: number, val: number) => {
        const newItems = [...items];
        newItems[index].procureQty = Math.max(0, val);
        if (newItems[index].procureQty > 0) {
            newItems[index].selected = true;
        } else {
            newItems[index].selected = false;
        }
        setItems(newItems);
    };

    const handleSubmit = async () => {
        const selectedItems = items.filter(i => i.selected && i.procureQty > 0);

        if (selectedItems.length === 0) {
            toast.error("Please select at least one material to procure.");
            return;
        }

        setLoading(true);
        try {
            const result = await createManualPurchaseRequest({
                salesOrderId: order.salesOrderId || undefined,
                priority,
                notes,
                items: selectedItems.map(i => ({
                    productVariantId: i.productVariantId,
                    quantity: i.procureQty,
                    notes: `Manually requested from Work Order ${order.orderNumber}`
                }))
            });

            if (result) {
                toast.success("Purchase Request created successfully!");
                setIsOpen(false);
                // Reset form
                setItems(items.map(i => ({ ...i, procureQty: 0, selected: false })));
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to create Purchase Request");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                    <ShoppingCart className="h-4 w-4" />
                    Procure Materials
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Manual Procurement</DialogTitle>
                    <DialogDescription>
                        Select materials from this Work Order to create a Purchase Request.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="border rounded-md overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-muted">
                                <tr>
                                    <th className="p-3 text-left w-10">Select</th>
                                    <th className="p-3 text-left">Material</th>
                                    <th className="p-3 text-right">Planned</th>
                                    <th className="p-3 text-center w-32">Qty to Procure</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {items.map((item, index) => (
                                    <tr key={item.productVariantId} className={item.selected ? "bg-blue-50/50" : ""}>
                                        <td className="p-3 text-center">
                                            <input
                                                type="checkbox"
                                                checked={item.selected}
                                                onChange={() => handleToggleSelect(index)}
                                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600"
                                            />
                                        </td>
                                        <td className="p-3">
                                            <div className="font-medium">{item.name}</div>
                                            <div className="text-xs text-muted-foreground">{item.skuCode}</div>
                                        </td>
                                        <td className="p-3 text-right text-muted-foreground">
                                            {item.plannedQty} {item.unit}
                                        </td>
                                        <td className="p-3">
                                            <div className="flex items-center gap-1">
                                                <Button
                                                    variant="outline"
                                                    size="icon"
                                                    className="h-7 w-7"
                                                    onClick={() => handleQtyChange(index, item.procureQty - 1)}
                                                >
                                                    <Minus className="h-3 w-3" />
                                                </Button>
                                                <Input
                                                    type="number"
                                                    value={item.procureQty}
                                                    onChange={(e) => handleQtyChange(index, Number(e.target.value))}
                                                    className="h-7 text-center text-xs"
                                                />
                                                <Button
                                                    variant="outline"
                                                    size="icon"
                                                    className="h-7 w-7"
                                                    onClick={() => handleQtyChange(index, item.procureQty + 1)}
                                                >
                                                    <Plus className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {items.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="p-8 text-center text-muted-foreground italic">
                                            No planned materials found for this order.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Priority</Label>
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant={priority === 'NORMAL' ? 'default' : 'outline'}
                                    size="sm"
                                    className="flex-1"
                                    onClick={() => setPriority('NORMAL')}
                                >
                                    Normal
                                </Button>
                                <Button
                                    type="button"
                                    variant={priority === 'URGENT' ? 'destructive' : 'outline'}
                                    size="sm"
                                    className="flex-1"
                                    onClick={() => setPriority('URGENT')}
                                >
                                    Urgent
                                </Button>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="notes">Notes</Label>
                            <Input
                                id="notes"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Additional notes for Purchasing..."
                            />
                        </div>
                    </div>

                    <div className="bg-amber-50 border border-amber-200 rounded-md p-3 flex gap-3 text-amber-800 text-xs">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <div>
                            This will create a new <strong>Purchase Request</strong> for the Purchasing team.
                            It will NOT create a Purchase Order directly.
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsOpen(false)} disabled={loading}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={loading || items.filter(i => i.selected).length === 0}>
                        {loading ? "Creating PR..." : "Create Purchase Request"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
