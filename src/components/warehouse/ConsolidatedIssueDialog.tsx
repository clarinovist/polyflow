'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Loader2, ClipboardList, ShoppingBag } from 'lucide-react';
import { Location } from '@prisma/client';
import { ExtendedProductionOrder } from '../production/order-detail/types';
import { consolidatedBatchIssueMaterials } from '@/actions/production/production';
import { cn } from '@/lib/utils/utils';

const STATUS_BADGE: Record<string, string> = {
    RELEASED: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    WAITING_MATERIAL: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-400',
    IN_PROGRESS: 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-400',
    COMPLETED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400',
    CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-400',
};

interface ConsolidatedIssueDialogProps {
    isOpen: boolean;
    onClose: () => void;
    orders: ExtendedProductionOrder[];
    locations: Location[];
}

interface AggregatedItem {
    productVariantId: string;
    skuCode: string;
    variantName: string;
    totalPlanned: number;
    totalIssued: number;
    remainingNeed: number;
    quantityToIssue: number;
    unit: string;
}

export function ConsolidatedIssueDialog({
    isOpen,
    onClose,
    orders,
    locations,
}: ConsolidatedIssueDialogProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    // Default: select all active orders
    const [selectedOrderIds, setSelectedOrderIds] = useState<Record<string, boolean>>({});
    const [sourceLocationId, setSourceLocationId] = useState<string>('');
    const [aggregatedItems, setAggregatedItems] = useState<AggregatedItem[]>([]);

    // Filter to raw material warehouses
    const warehouseLocations = locations.filter(loc =>
        loc.slug.toLowerCase().includes('raw') ||
        loc.slug.toLowerCase().includes('gudang') ||
        loc.locationPurpose === 'RAW_MATERIAL' ||
        loc.locationPurpose === 'PACKING'
    );

    // Initial state setup when dialog opens
    useEffect(() => {
        if (isOpen) {
            // Select all RELEASED & WAITING_MATERIAL orders by default
            const initialSelection: Record<string, boolean> = {};
            orders.forEach(o => {
                if (o.status === 'RELEASED' || o.status === 'WAITING_MATERIAL') {
                    initialSelection[o.id] = true;
                }
            });
            setSelectedOrderIds(initialSelection);

            // Prefer raw/gudang locations for default source (recomputed from locations)
            const preferredWarehouses = locations.filter(loc =>
                loc.slug.toLowerCase().includes('raw') ||
                loc.slug.toLowerCase().includes('gudang') ||
                loc.locationPurpose === 'RAW_MATERIAL' ||
                loc.locationPurpose === 'PACKING'
            );
            const rawMaterialLoc = locations.find(loc => loc.slug.toLowerCase().includes('raw'));
            if (rawMaterialLoc) {
                setSourceLocationId(rawMaterialLoc.id);
            } else if (preferredWarehouses.length > 0) {
                setSourceLocationId(preferredWarehouses[0].id);
            } else if (locations.length > 0) {
                setSourceLocationId(locations[0].id);
            }
        }
    }, [isOpen, orders, locations]);

    // Recalculate aggregated material needs whenever selected orders change
    useEffect(() => {
        const selectedOrders = orders.filter(o => selectedOrderIds[o.id]);

        // Map of variantId -> aggregation details
        const map: Record<string, {
            skuCode: string;
            variantName: string;
            totalPlanned: number;
            totalIssued: number;
            unit: string;
        }> = {};

        selectedOrders.forEach(order => {
            const plannedMaterials = order.plannedMaterials || [];
            const materialIssues = order.materialIssues || [];

            plannedMaterials.forEach(pm => {
                const varId = pm.productVariantId;
                if (!map[varId]) {
                    map[varId] = {
                        skuCode: pm.productVariant.skuCode || '',
                        variantName: pm.productVariant.name,
                        totalPlanned: 0,
                        totalIssued: 0,
                        unit: pm.productVariant.primaryUnit || 'PCS',
                    };
                }
                map[varId].totalPlanned += Number(pm.quantity);
            });

            materialIssues.forEach(mi => {
                if (mi.status === 'VOIDED') return;
                const varId = mi.productVariantId;
                if (map[varId]) {
                    map[varId].totalIssued += Number(mi.quantity);
                }
            });
        });

        // Convert map to array and compute remaining need & default quantity to issue
        const itemsList: AggregatedItem[] = Object.entries(map).map(([varId, info]) => {
            const remaining = Math.max(0, info.totalPlanned - info.totalIssued);
            return {
                productVariantId: varId,
                skuCode: info.skuCode,
                variantName: info.variantName,
                totalPlanned: info.totalPlanned,
                totalIssued: info.totalIssued,
                remainingNeed: remaining,
                quantityToIssue: Number(remaining.toFixed(4)),
                unit: info.unit,
            };
        });

        setAggregatedItems(itemsList);
    }, [selectedOrderIds, orders]);

    const handleQtyChange = (varId: string, val: string) => {
        const parsed = parseFloat(val);
        setAggregatedItems(prev =>
            prev.map(item =>
                item.productVariantId === varId
                    ? { ...item, quantityToIssue: isNaN(parsed) ? 0 : parsed }
                    : item
            )
        );
    };

    const handleToggleOrder = (orderId: string, checked: boolean) => {
        setSelectedOrderIds(prev => ({
            ...prev,
            [orderId]: checked,
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const activeOrderIds = Object.keys(selectedOrderIds).filter(id => selectedOrderIds[id]);
        if (activeOrderIds.length === 0) {
            toast.error('Silakan pilih minimal satu perintah kerja.');
            return;
        }

        if (!sourceLocationId) {
            toast.error('Lokasi gudang asal wajib dipilih.');
            return;
        }

        const itemsToIssue = aggregatedItems
            .filter(item => item.quantityToIssue > 0)
            .map(item => ({
                productVariantId: item.productVariantId,
                quantity: item.quantityToIssue,
            }));

        if (itemsToIssue.length === 0) {
            toast.error('Silakan masukkan jumlah bahan yang akan diambil.');
            return;
        }

        startTransition(async () => {
            try {
                const result = await consolidatedBatchIssueMaterials({
                    productionOrderIds: activeOrderIds,
                    locationId: sourceLocationId,
                    items: itemsToIssue,
                    requestId: `consol-${Date.now()}`,
                });

                if (result.success) {
                    toast.success('Pengambilan bahan konsolidasi berhasil dikonfirmasi.');
                    onClose();
                    router.refresh();
                } else {
                    toast.error(result.error || 'Gagal mengonfirmasi pengambilan bahan.');
                }
            } catch (_err) {
                toast.error('Terjadi kesalahan sistem saat memproses pengambilan bahan.');
            }
        });
    };

    const selectedCount = Object.values(selectedOrderIds).filter(Boolean).length;
    const materialsWithQty = aggregatedItems.filter(i => i.quantityToIssue > 0).length;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-4xl bg-white dark:bg-slate-900 border dark:border-slate-800 h-[85vh] flex flex-col p-0 gap-0">
                <form onSubmit={handleSubmit} className="flex flex-col h-full min-h-0">
                    <DialogHeader className="p-5 pb-4 border-b dark:border-slate-800 shrink-0">
                        <DialogTitle className="text-lg font-bold flex items-center gap-2">
                            <ClipboardList className="h-5 w-5 text-amber-600 dark:text-amber-500 shrink-0" />
                            Pengambilan Bahan Konsolidasi
                        </DialogTitle>
                        <DialogDescription>
                            Gabungkan pengambilan bahan baku untuk beberapa SPK harian agar lebih efisien.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto p-5 space-y-5 min-h-0">
                        {/* Section 1: Select Orders */}
                        <div className="space-y-2.5">
                            <div className="flex items-center justify-between gap-2">
                                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                                    1. Pilih SPK
                                </h3>
                                <span className="text-xs text-muted-foreground tabular-nums">
                                    {selectedCount}/{orders.length} dipilih
                                </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto border rounded-lg p-2 bg-slate-50/50 dark:bg-slate-950/30 dark:border-slate-800">
                                {orders.map(o => {
                                    const checked = !!selectedOrderIds[o.id];
                                    const shortNo = o.orderNumber.split('-').slice(-2).join('-');
                                    const productName = o.bom.productVariant.product.name;
                                    return (
                                        <label
                                            key={o.id}
                                            htmlFor={`chk-${o.id}`}
                                            className={cn(
                                                'flex items-start gap-2.5 p-2.5 rounded-md border cursor-pointer transition-colors',
                                                checked
                                                    ? 'bg-white dark:bg-slate-900 border-amber-300/70 dark:border-amber-700/50 shadow-sm'
                                                    : 'bg-transparent border-transparent hover:bg-white/70 dark:hover:bg-slate-900/60'
                                            )}
                                        >
                                            <Checkbox
                                                id={`chk-${o.id}`}
                                                checked={checked}
                                                onCheckedChange={(v) => handleToggleOrder(o.id, !!v)}
                                                className="mt-0.5 shrink-0"
                                            />
                                            <div className="min-w-0 flex-1 space-y-1">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100">
                                                        {shortNo}
                                                    </span>
                                                    <Badge
                                                        variant="secondary"
                                                        className={cn(
                                                            'text-[9px] h-5 px-1.5 font-semibold uppercase tracking-wide shrink-0 border-0',
                                                            STATUS_BADGE[o.status] || 'bg-slate-100 text-slate-600'
                                                        )}
                                                    >
                                                        {o.status.replace(/_/g, ' ')}
                                                    </Badge>
                                                </div>
                                                <p className="text-xs text-muted-foreground line-clamp-2 leading-snug">
                                                    {productName}
                                                </p>
                                            </div>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Section 2: Source Location */}
                        <div className="space-y-2 max-w-md">
                            <Label htmlFor="sourceLoc" className="text-sm font-semibold">
                                2. Lokasi Gudang Asal
                            </Label>
                            <Select value={sourceLocationId} onValueChange={setSourceLocationId}>
                                <SelectTrigger id="sourceLoc" className="w-full bg-white dark:bg-slate-900 border dark:border-slate-800">
                                    <SelectValue placeholder="Pilih gudang asal bahan baku" />
                                </SelectTrigger>
                                <SelectContent className="bg-white dark:bg-slate-900">
                                    {warehouseLocations.map(loc => (
                                        <SelectItem key={loc.id} value={loc.id}>
                                            {loc.name} ({loc.slug})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Section 3: Materials table */}
                        <div className="space-y-2.5">
                            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                                    3. Akumulasi Kebutuhan Bahan Baku
                                </h3>
                                <p className="text-[11px] text-muted-foreground">
                                    Default = sisa kebutuhan planned
                                </p>
                            </div>

                            {aggregatedItems.length === 0 ? (
                                <div className="text-center p-8 border rounded-lg dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-muted-foreground flex flex-col items-center gap-2">
                                    <ShoppingBag className="h-8 w-8 opacity-45" />
                                    <span className="text-sm">Tidak ada bahan baku yang perlu diambil untuk SPK yang dipilih.</span>
                                </div>
                            ) : (
                                <div className="border rounded-lg overflow-auto dark:border-slate-800 max-h-[40vh]">
                                    <table className="w-full text-xs text-left min-w-[640px]">
                                        <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold uppercase text-[10px] tracking-wider border-b dark:border-slate-700 sticky top-0 z-10">
                                            <tr>
                                                <th className="p-3 min-w-[180px]">Bahan Baku</th>
                                                <th className="p-3 text-right whitespace-nowrap">Total Direncanakan</th>
                                                <th className="p-3 text-right whitespace-nowrap">Sudah Diambil</th>
                                                <th className="p-3 text-right whitespace-nowrap">Sisa Kebutuhan</th>
                                                <th className="p-3 text-center min-w-[140px]">Jumlah Diambil</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                                            {aggregatedItems.map(item => (
                                                <tr key={item.productVariantId} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/10">
                                                    <td className="p-3 font-medium">
                                                        <div className="font-bold text-slate-800 dark:text-slate-200">{item.variantName}</div>
                                                        <div className="text-[10px] text-muted-foreground font-mono">{item.skuCode}</div>
                                                    </td>
                                                    <td className="p-3 text-right text-slate-600 dark:text-slate-400 tabular-nums whitespace-nowrap">
                                                        {item.totalPlanned.toFixed(2)} {item.unit}
                                                    </td>
                                                    <td className="p-3 text-right text-slate-600 dark:text-slate-400 tabular-nums whitespace-nowrap">
                                                        {item.totalIssued.toFixed(2)} {item.unit}
                                                    </td>
                                                    <td className="p-3 text-right text-amber-600 dark:text-amber-500 font-bold tabular-nums whitespace-nowrap">
                                                        {item.remainingNeed.toFixed(2)} {item.unit}
                                                    </td>
                                                    <td className="p-3">
                                                        <div className="flex items-center justify-center gap-1.5">
                                                            <Input
                                                                type="number"
                                                                step="0.0001"
                                                                min="0"
                                                                value={item.quantityToIssue === 0 ? '' : item.quantityToIssue}
                                                                onChange={(e) => handleQtyChange(item.productVariantId, e.target.value)}
                                                                className="h-8 w-28 text-right text-xs bg-slate-50/50 focus:bg-white dark:bg-slate-950/40 border dark:border-slate-800 font-bold tabular-nums"
                                                                placeholder="0"
                                                            />
                                                            <span className="text-[10px] font-bold text-slate-500 w-8 shrink-0">{item.unit}</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>

                    <DialogFooter className="p-4 sm:p-5 border-t dark:border-slate-800 bg-slate-50 dark:bg-slate-950/30 shrink-0 sm:justify-between gap-3">
                        <p className="text-xs text-muted-foreground tabular-nums hidden sm:block">
                            {selectedCount} SPK · {materialsWithQty} bahan
                        </p>
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={onClose}
                                disabled={isPending}
                                className="flex-1 sm:flex-none bg-white dark:bg-slate-900 border dark:border-slate-800"
                            >
                                Batal
                            </Button>
                            <Button
                                type="submit"
                                disabled={isPending || selectedCount === 0 || materialsWithQty === 0}
                                className="flex-1 sm:flex-none bg-amber-600 hover:bg-amber-700 text-white font-bold"
                            >
                                {isPending ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Memproses...
                                    </>
                                ) : (
                                    'Konfirmasi Pengambilan'
                                )}
                            </Button>
                        </div>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
