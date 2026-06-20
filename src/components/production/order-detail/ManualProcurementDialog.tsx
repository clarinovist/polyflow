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
import { createManualPurchaseRequest } from '@/actions/purchasing/purchasing';
import { ExtendedProductionOrder } from './types';
import { productionComponentLabels } from '@/lib/labels';

interface ManualProcurementDialogProps {
    order: ExtendedProductionOrder;
}

export function ManualProcurementDialog({ order }: ManualProcurementDialogProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    // Initialize quantities based on planned materials
    const [items, setItems] = useState(
        order.plannedMaterials
            .filter(pm => {
                const type = pm.productVariant.product.productType;
                // Exclude internal items (Intermediate, WIP, Finished Goods)
                return !['INTERMEDIATE', 'WIP', 'FINISHED_GOOD', 'SCRAP'].includes(type || '');
            })
            .map(pm => ({
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
            toast.error('Pilih minimal satu material untuk pengadaan.');
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
                toast.success("Purchase Request berhasil dibuat!");
                setIsOpen(false);
                // Reset form
                setItems(items.map(i => ({ ...i, procureQty: 0, selected: false })));
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Gagal membuat Purchase Request');
        } finally {
            setLoading(false);
        }
    };

    // If all materials are internal (Intermediate/WIP), hide the Procure button
    if (items.length === 0) {
        return null;
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                    <ShoppingCart className="h-4 w-4" />
                    {productionComponentLabels.procureMaterials}
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{productionComponentLabels.manualProcurement}</DialogTitle>
                    <DialogDescription>
                        {productionComponentLabels.selectMaterialsDescription}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="border rounded-md overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-muted">
                                <tr>
                                    <th className="p-3 text-left w-10">{productionComponentLabels.select}</th>
                                    <th className="p-3 text-left">{productionComponentLabels.materialHeader}</th>
                                    <th className="p-3 text-right">{productionComponentLabels.plannedHeader}</th>
                                    <th className="p-3 text-center w-32">{productionComponentLabels.qtyToProcure}</th>
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
                                                    step="any"
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
                                            Tidak ada material terencana ditemukan untuk order ini.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>{productionComponentLabels.priority}</Label>
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant={priority === 'NORMAL' ? 'default' : 'outline'}
                                    size="sm"
                                    className="flex-1"
                                    onClick={() => setPriority('NORMAL')}
                                >
                                    {productionComponentLabels.normal}
                                </Button>
                                <Button
                                    type="button"
                                    variant={priority === 'URGENT' ? 'destructive' : 'outline'}
                                    size="sm"
                                    className="flex-1"
                                    onClick={() => setPriority('URGENT')}
                                >
                                    {productionComponentLabels.urgent}
                                </Button>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="notes">{productionComponentLabels.notes}</Label>
                            <Input
                                id="notes"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder={productionComponentLabels.additionalNotes}
                            />
                        </div>
                    </div>

                    <div className="bg-amber-50 border border-amber-200 rounded-md p-3 flex gap-3 text-amber-800 text-xs">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <div>
                            {productionComponentLabels.purchaseRequestInfo}
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsOpen(false)} disabled={loading}>
                        {productionComponentLabels.cancel}
                    </Button>
                    <Button onClick={handleSubmit} disabled={loading || items.filter(i => i.selected).length === 0}>
                        {loading ? productionComponentLabels.creatingPR : productionComponentLabels.createPurchaseRequest}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
