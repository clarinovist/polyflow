import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ExtendedProductionOrder } from './types';
import { Location, ProductVariant } from '@prisma/client';
import { batchIssueMaterials } from '@/actions/production/production';
import { transferStockBulk, getRealtimeStock, adjustStock } from '@/actions/inventory/inventory';
import { toast } from 'sonner';
import { Plus, Trash2, Package, AlertCircle, ArrowRightLeft, RefreshCw, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils/utils';
import { productionComponentLabels } from '@/lib/labels';
import {
    resolveTransferSourceLocationId,
    type LocationLike,
} from '@/lib/locations/resolve-location';

interface BatchItem {
    id: string; // Internal ID for keys (equals to plannedMaterial.id if isPlanned)
    productVariantId: string;
    quantity: number;
    sourceLocationId?: string;
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
    /** Multi-source: per-row override hidden by default (plan TAHAP 1) */
    const [perItemSourceEnabled, setPerItemSourceEnabled] = useState(false);

    const defaultSourceLocationId = useMemo(
        () =>
            resolveTransferSourceLocationId(
                locations as LocationLike[],
                order.bom?.category,
                order.machine?.locationId,
            ),
        [order, locations],
    );

    const [selectedLocation, setSelectedLocation] = useState(defaultSourceLocationId);
    const router = useRouter();

    const effectiveSourceForItem = (item: BatchItem) =>
        perItemSourceEnabled ? (item.sourceLocationId || selectedLocation) : selectedLocation;

    // Check if transfer mode (Backflush) based on machine type OR bom category
    const isTransferMode = order.machine?.type === 'MIXER' ||
        ['MIXING', 'EXTRUSION', 'PACKING', 'REWORK'].includes(order.bom?.category || '') ||
        (order.bom?.name || '').toLowerCase().includes('adonan');

    // Initial items based on plannedMaterials
    const initialItems = useMemo(() => {
        const plannedItems = (order.plannedMaterials || []).map((pm) => {
            const issued = order.materialIssues
                .filter((mi) => mi.productVariantId === pm.productVariantId && mi.status !== 'VOIDED')
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
    const [stockLevels, setStockLevels] = useState<Record<string, number>>({});
    const [checkingStock, setCheckingStock] = useState(false);
    const [adjustingItem, setAdjustingItem] = useState<{ id: string, name: string, variantId: string, locationId: string, needed: number, current: number } | null>(null);
    const [adjustReason, setAdjustReason] = useState("Ad-hoc production adjustment");

    // Fetch Stock Levels
    const checkStocks = async () => {
        setCheckingStock(true);
        const newStocks: Record<string, number> = {};
        const activeItems = items.filter(i => !i.isDeletedPlan && i.productVariantId);

        await Promise.all(activeItems.map(async (item) => {
            try {
                const locToUse = effectiveSourceForItem(item);
                const res = await getRealtimeStock(locToUse, item.productVariantId);
                if (res.success && typeof res.data === 'number') {
                    const stockKey = `${locToUse}_${item.productVariantId}`;
                    newStocks[stockKey] = res.data;
                }
            } catch (_e) {
                console.error(_e);
            }
        }));

        setStockLevels(newStocks);
        setCheckingStock(false);
    };

    // Check on location change or open
    useEffect(() => {
        if (open) {
            checkStocks();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, selectedLocation, perItemSourceEnabled]);

    const handleQuickAdjust = async () => {
        if (!adjustingItem) return;
        const missing = Math.max(0, adjustingItem.needed - adjustingItem.current);
        if (missing <= 0) return;

        try {
            const res = await adjustStock({
                locationId: adjustingItem.locationId,
                productVariantId: adjustingItem.variantId,
                type: 'ADJUSTMENT_IN',
                quantity: missing,
                reason: adjustReason
            });

            if (res.success) {
                toast.success("Stok berhasil disesuaikan.");
                setAdjustingItem(null);
                checkStocks(); // Refresh
            } else {
                toast.error(res.error || 'Gagal menyesuaikan stok');
            }
        } catch (_e) {
            toast.error('Gagal menyesuaikan stok. Silakan coba lagi.');
        }
    };

    const handleAddSubstitute = () => {
        const newItem: BatchItem = {
            id: `sub-${Date.now()}`,
            productVariantId: '',
            quantity: 0,
            sourceLocationId: selectedLocation,
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

    const handleUpdateLocation = (id: string, locId: string) => {
        setItems(items.map(item => item.id === id ? { ...item, sourceLocationId: locId } : item));
    };

    async function onSubmit() {
        const validItems = items.filter(i => !i.isDeletedPlan && i.quantity > 0 && i.productVariantId !== '');

        // Always calculate plan changes
        const removedPlannedMaterialIds = items.filter(i => i.isPlanned && i.isDeletedPlan).map(i => i.id);
        const addedPlannedMaterials = items.filter(i => !i.isPlanned && i.quantity > 0 && i.productVariantId !== '').map(i => ({
            productVariantId: i.productVariantId,
            quantity: i.quantity
        }));

        if (validItems.length === 0 && removedPlannedMaterialIds.length === 0 && addedPlannedMaterials.length === 0) {
            toast.error('Tidak ada perubahan untuk diproses');
            return;
        }

        setLoading(true);
        try {
            if (isTransferMode) {
                // Harden: block non-plan items in EXTRUSION/PACKING transfer — use ad-hoc dialog instead
                const isExtrusionOrPacking = ['EXTRUSION', 'PACKING'].includes(order.bom?.category || '');
                if (isExtrusionOrPacking) {
                    const nonPlanItems = validItems.filter(i => !i.isPlanned);
                    const nonPlanPlanned = addedPlannedMaterials.filter(
                        ap => !order.plannedMaterials?.some(pm => pm.productVariantId === ap.productVariantId)
                    );
                    if (nonPlanItems.length > 0 || nonPlanPlanned.length > 0) {
                        toast.error(productionComponentLabels.nonPlanBlockedInExtrusi, {
                            duration: 6000,
                        });
                        setLoading(false);
                        return;
                    }
                }

                // TRANSFER MODE: group by source (global only unless multi-source enabled)
                const transfersByLocation = validItems.reduce((acc, item) => {
                    const loc = effectiveSourceForItem(item);
                    if (!acc[loc]) acc[loc] = [];
                    acc[loc].push({
                        productVariantId: item.productVariantId,
                        quantity: item.quantity
                    });
                    return acc;
                }, {} as Record<string, { productVariantId: string, quantity: number }[]>);

                // Validate: every source used for transfer must differ from WO destination
                if (
                    validItems.length > 0 &&
                    Object.keys(transfersByLocation).includes(order.location.id)
                ) {
                    toast.error(productionComponentLabels.sourceDestinationSame);
                    setLoading(false);
                    return;
                }

                // Execute all transfers
                const results = await Promise.all(
                    Object.entries(transfersByLocation).map(([sourceLocId, itemsToTransfer]) =>
                        transferStockBulk({
                            sourceLocationId: sourceLocId,
                            destinationLocationId: order.location.id, // Target is the Production Location
                            items: itemsToTransfer,
                            date: new Date(),
                            notes: `Transfer for Order ${order.orderNumber}`
                        })
                    )
                );

                const hasError = results.some(r => !r.success);
                // Note: Partial failure could happen, but we assume atomic failures for now.
                
                if (!hasError) {
                    // SYNC PLAN: Also update the production plan if there are changes
                    if (removedPlannedMaterialIds.length > 0 || addedPlannedMaterials.length > 0 || validItems.some(i => i.isPlanned)) {
                        await batchIssueMaterials({
                            productionOrderId: order.id,
                            locationId: selectedLocation,
                            items: [], // Don't issue stock here (already moved via transferStockBulk)
                            removedPlannedMaterialIds,
                            addedPlannedMaterials: [
                                ...addedPlannedMaterials,
                                // Also update existing planned items if their quantity changed
                                ...items.filter(i => i.isPlanned && !i.isDeletedPlan && i.quantity !== i.originalQuantity && !removedPlannedMaterialIds.includes(i.id)).map(i => ({
                                    productVariantId: i.productVariantId,
                                    quantity: i.quantity
                                }))
                            ],
                            requestId: `REQ-SYNC-${Date.now()}`
                        });
                    }

                    toast.success(`Bahan baku berhasil ditransfer ke Gudang ${order.location.name}.`);
                    setOpen(false);
                    router.refresh();
                } else {
                    const firstError = results.find(r => !r.success)?.error;
                    toast.error(firstError || 'Gagal mentransfer material');
                }
            } else {
                // STANDARD MODE: Issue Logic
                const result = await batchIssueMaterials({
                    productionOrderId: order.id,
                    locationId: selectedLocation,
                    items: validItems.map(i => ({
                        productVariantId: i.productVariantId,
                        quantity: i.quantity,
                        sourceLocationId: perItemSourceEnabled ? i.sourceLocationId : undefined
                    })),
                    removedPlannedMaterialIds,
                    addedPlannedMaterials,
                    requestId: `REQ-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
                });

                if (result.success) {
                    toast.success("Bahan baku berhasil dikeluarkan dan rencana diperbarui.");
                    setOpen(false);
                    router.refresh();
                } else {
                    toast.error(result.error || 'Gagal memperbarui material');
                }
            }
        } catch {
            toast.error('Gagal menyesuaikan stok. Silakan coba lagi.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                        {isTransferMode ? <ArrowRightLeft className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                        {isTransferMode ? productionComponentLabels.transferMaterial : productionComponentLabels.issueMaterial}
                    </Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>{isTransferMode ? productionComponentLabels.transferMaterialsToStaging : productionComponentLabels.issueMaterialsAndUpdatePlan}</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-6">
                        <div className="bg-muted/40 p-4 rounded-lg border space-y-3">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-medium text-muted-foreground">
                                    {isTransferMode ? 'Alur transfer' : productionComponentLabels.sourceLocation}
                                </p>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={checkStocks}
                                    disabled={checkingStock}
                                    className="h-7 shrink-0 text-xs"
                                >
                                    <RefreshCw className={cn("w-3 h-3 mr-1", checkingStock && "animate-spin")} />
                                    {productionComponentLabels.refreshStock}
                                </Button>
                            </div>

                            {isTransferMode ? (
                                <>
                                    {/* Stacked layout: long warehouse names never collide */}
                                    <div className="space-y-3">
                                        <div className="space-y-1.5 min-w-0">
                                            <Label className="text-xs text-muted-foreground">
                                                {productionComponentLabels.sourceLocation}
                                            </Label>
                                            <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                                                <SelectTrigger className="w-full">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {locations.map(l => (
                                                        <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="flex items-center gap-2 text-muted-foreground px-0.5">
                                            <div className="h-px flex-1 bg-border" />
                                            <ArrowRightLeft className="w-3.5 h-3.5 shrink-0" aria-hidden />
                                            <div className="h-px flex-1 bg-border" />
                                        </div>

                                        <div className="space-y-1.5 min-w-0">
                                            <Label className="text-xs text-muted-foreground">
                                                {productionComponentLabels.destinationLocation}
                                            </Label>
                                            <div
                                                className={cn(
                                                    "w-full min-w-0 rounded-md border px-3 py-2.5 text-sm font-medium leading-snug break-words",
                                                    selectedLocation === order.location.id
                                                        ? "border-destructive/50 bg-destructive/10 text-destructive"
                                                        : "border-input bg-background"
                                                )}
                                            >
                                                {order.location.name}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                                                <span>{productionComponentLabels.destinationFromOrder}</span>
                                                <span className="text-border" aria-hidden>·</span>
                                                <Link
                                                    href={`/production/orders/${order.id}#output-location`}
                                                    className="underline underline-offset-2 text-primary hover:text-primary/80 shrink-0"
                                                >
                                                    {productionComponentLabels.editOrderLocation}
                                                </Link>
                                            </div>
                                        </div>
                                    </div>

                                    {selectedLocation === order.location.id && (
                                        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
                                            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                            <span className="min-w-0 leading-relaxed">
                                                {productionComponentLabels.sourceDestinationSame}
                                                {' '}
                                                <Link
                                                    href={`/production/orders/${order.id}#output-location`}
                                                    className="underline font-semibold"
                                                >
                                                    {productionComponentLabels.editOrderLocation}
                                                </Link>
                                            </span>
                                        </div>
                                    )}

                                    <div className="text-amber-800 dark:text-amber-400 flex items-start gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40 p-2.5 rounded-md text-xs">
                                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                        <div className="min-w-0 text-left space-y-1 leading-relaxed">
                                            <p>{productionComponentLabels.transferDirectionHint}</p>
                                            <p className="text-amber-700/90 dark:text-amber-500/90">
                                                {productionComponentLabels.backflushConsumeHint}
                                            </p>
                                            {!order.location.name.toLowerCase().includes('production') &&
                                                !order.location.name.toLowerCase().includes('staging') &&
                                                !order.location.name.toLowerCase().includes('produksi') &&
                                                !order.location.name.toLowerCase().includes('wip') && (
                                                    <p className="font-semibold text-red-600 dark:text-red-400">
                                                        {productionComponentLabels.warningTargetWarehouse}
                                                    </p>
                                                )}
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-1.5 min-w-0">
                                        <Label className="text-xs text-muted-foreground">
                                            {productionComponentLabels.sourceLocation}
                                        </Label>
                                        <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                                            <SelectTrigger className="w-full">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {locations.map(l => (
                                                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="flex items-start gap-2 text-muted-foreground sm:pt-6">
                                        <AlertCircle className="w-4 h-4 mt-0.5 text-blue-500 shrink-0" />
                                        <span className="text-xs text-left leading-relaxed">
                                            {productionComponentLabels.editingRowsWarning}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="rounded-md border">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/40 border-b">
                                    <tr>
                                        <th className="p-3 text-left font-medium">{productionComponentLabels.materialHeader}</th>
                                        <th className="p-3 text-right font-medium w-32">{isTransferMode ? productionComponentLabels.qtyToTransfer : productionComponentLabels.qtyToIssue}</th>
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
                                                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{productionComponentLabels.planned}</span>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-1">
                                                        <Select value={item.productVariantId} onValueChange={(val) => handleUpdateVariant(item.id, val)}>
                                                            <SelectTrigger className="h-9">
                                                                <SelectValue placeholder={productionComponentLabels.selectSubstitute} />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {rawMaterials.map(m => (
                                                                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{productionComponentLabels.substitute}</span>
                                                    </div>
                                                )}
                                                {perItemSourceEnabled && (
                                                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                                                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                                            {productionComponentLabels.sourcePerItem}:
                                                        </span>
                                                        <Select
                                                            value={item.sourceLocationId || selectedLocation}
                                                            onValueChange={(val) => handleUpdateLocation(item.id, val)}
                                                        >
                                                            <SelectTrigger
                                                                className={cn(
                                                                    "h-7 text-xs border-dashed w-fit max-w-[220px]",
                                                                    isTransferMode &&
                                                                        effectiveSourceForItem(item) === order.location.id &&
                                                                        "border-destructive/60 text-destructive"
                                                                )}
                                                            >
                                                                <SelectValue placeholder={productionComponentLabels.overrideSourceLocation} />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value={selectedLocation}>
                                                                    {locations.find(l => l.id === selectedLocation)?.name
                                                                        ?? productionComponentLabels.defaultLocation}
                                                                    {' '}
                                                                    <span className="text-muted-foreground">
                                                                        ({productionComponentLabels.useGlobalSource})
                                                                    </span>
                                                                </SelectItem>
                                                                {locations.filter(l => l.id !== selectedLocation).map(l => (
                                                                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                        {isTransferMode && (
                                                            <span className="text-[10px] text-muted-foreground">
                                                                {productionComponentLabels.toDestination}:{' '}
                                                                <span className="font-medium text-foreground">{order.location.name}</span>
                                                            </span>
                                                        )}
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
                                                {!isTransferMode && (() => {
                                                    const locToUse = effectiveSourceForItem(item);
                                                    const stockKey = `${locToUse}_${item.productVariantId}`;
                                                    const currentStock = stockLevels[stockKey];
                                                    
                                                    return (
                                                        <div className="mt-1 flex items-center justify-end gap-2">
                                                            <span className="text-[10px] text-muted-foreground">
                                                                {productionComponentLabels.stock}: {currentStock ?? '...'}
                                                            </span>
                                                            {(currentStock !== undefined && currentStock < item.quantity) && (
                                                                <Button
                                                                    variant="destructive"
                                                                    size="sm"
                                                                    className="h-5 text-[10px] px-1.5"
                                                                    onClick={() => setAdjustingItem({
                                                                        id: item.id,
                                                                        name: item.name,
                                                                        variantId: item.productVariantId,
                                                                        locationId: locToUse,
                                                                        needed: item.quantity,
                                                                        current: currentStock || 0
                                                                    })}
                                                                >
                                                                    <Wrench className="w-3 h-3 mr-1" /> {productionComponentLabels.fixShortage}
                                                                </Button>
                                                            )}
                                                        </div>
                                                    );
                                                })()}
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
                                                        title={item.isDeletedPlan ? productionComponentLabels.undoDelete : productionComponentLabels.removeRequirement}
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
                            <div className="flex flex-col sm:flex-row border-t">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="flex-1 h-10 rounded-none text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                    onClick={handleAddSubstitute}
                                >
                                    <Plus className="w-4 h-4 mr-2" /> {productionComponentLabels.addSubstituteMaterial}
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="flex-1 h-10 rounded-none text-muted-foreground hover:text-foreground hover:bg-muted/50 border-t sm:border-t-0 sm:border-l"
                                    onClick={() => {
                                        if (perItemSourceEnabled) {
                                            setItems(prev =>
                                                prev.map(i => ({ ...i, sourceLocationId: undefined })),
                                            );
                                            setPerItemSourceEnabled(false);
                                        } else {
                                            setPerItemSourceEnabled(true);
                                        }
                                    }}
                                >
                                    {perItemSourceEnabled
                                        ? productionComponentLabels.disablePerItemSource
                                        : productionComponentLabels.enablePerItemSource}
                                </Button>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="mt-6">
                        <Button variant="outline" onClick={() => setOpen(false)}>{productionComponentLabels.cancel}</Button>
                        <Button
                            onClick={onSubmit}
                            disabled={
                                loading ||
                                (isTransferMode &&
                                    items.some(
                                        i =>
                                            !i.isDeletedPlan &&
                                            i.quantity > 0 &&
                                            i.productVariantId !== '' &&
                                            effectiveSourceForItem(i) === order.location.id
                                    ))
                            }
                            className="bg-primary hover:bg-primary/90"
                        >
                            {loading ? 'Memproses...' : (isTransferMode ? 'Pindahkan Stok' : 'Simpan & Perbarui Rencana')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Quick Adjust Dialog */}
            <Dialog open={!!adjustingItem} onOpenChange={(o) => !o && setAdjustingItem(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{productionComponentLabels.quickStockAdjustment}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
                            Stok tidak mencukupi untuk <b>{adjustingItem?.name}</b>.
                            <br />
                            Dibutuhkan: <b>{adjustingItem?.needed}</b>. Tersedia: <b>{adjustingItem?.current}</b>.
                            <br />
                            Menambahkan selisih: <b>{adjustingItem ? (adjustingItem.needed - adjustingItem.current).toFixed(2) : 0}</b>
                        </div>
                        <div className="space-y-2">
                            <Label>Alasan</Label>
                            <Input value={adjustReason} onChange={e => setAdjustReason(e.target.value)} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setAdjustingItem(null)}>{productionComponentLabels.cancel}</Button>
                        <Button onClick={handleQuickAdjust}>Konfirmasi Penyesuaian</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
