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

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-4xl bg-white dark:bg-slate-900 border dark:border-slate-800 h-[85vh] flex flex-col p-0">
                <form onSubmit={handleSubmit} className="flex flex-col h-full">
                    <DialogHeader className="p-6 pb-4 border-b dark:border-slate-800">
                        <DialogTitle className="text-xl font-bold flex items-center gap-2">
                            <ClipboardList className="h-5 w-5 text-amber-600 dark:text-amber-500" />
                            Pengambilan Bahan Konsolidasi (Consolidated Picking)
                        </DialogTitle>
                        <DialogDescription>
                            Gabungkan pengambilan bahan baku untuk beberapa SPK harian agar lebih efisien.
                        </DialogDescription>
                    </DialogHeader>

                    {/* Scrollable Container */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        {/* Section 1: Select Orders */}
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold text-slate-850 dark:text-slate-200">
                                1. Pilih Perintah Kerja (SPK) yang Ingin Digabungkan
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-40 overflow-y-auto border rounded p-3 bg-slate-50/50 dark:bg-slate-950/20 dark:border-slate-800">
                                {orders.map(o => (
                                    <div key={o.id} className="flex items-center space-x-2 p-1.5 hover:bg-white dark:hover:bg-slate-900 rounded transition-colors">
                                        <Checkbox
                                            id={`chk-${o.id}`}
                                            checked={!!selectedOrderIds[o.id]}
                                            onCheckedChange={(checked) => handleToggleOrder(o.id, !!checked)}
                                        />
                                        <Label htmlFor={`chk-${o.id}`} className="text-xs font-medium cursor-pointer flex-1 flex justify-between items-center pr-2">
                                            <span className="font-mono font-bold truncate max-w-[120px]">{o.orderNumber.split('-').slice(-2).join('-')}</span>
                                            <span className="text-muted-foreground truncate max-w-[150px]">{o.bom.productVariant.product.name}</span>
                                            <span className="text-[10px] uppercase font-bold text-slate-500">{o.status}</span>
                                        </Label>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Section 2: Source Location Select */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
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
                        </div>

                        {/* Section 3: Consolidated Materials Table */}
                        <div className="space-y-3 pt-2">
                            <div className="flex justify-between items-center">
                                <h3 className="text-sm font-semibold text-slate-850 dark:text-slate-200">
                                    3. Akumulasi Kebutuhan Bahan Baku
                                </h3>
                                <div className="text-xs text-muted-foreground">
                                    *Jumlah default adalah sisa kebutuhan planned
                                </div>
                            </div>

                            {aggregatedItems.length === 0 ? (
                                <div className="text-center p-8 border rounded-lg dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-muted-foreground flex flex-col items-center gap-2">
                                    <ShoppingBag className="h-8 w-8 opacity-45" />
                                    <span className="text-sm">Tidak ada bahan baku yang perlu diambil untuk SPK yang dipilih.</span>
                                </div>
                            ) : (
                                <div className="border rounded-lg overflow-hidden dark:border-slate-800">
                                    <table className="w-full text-xs text-left">
                                        <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold uppercase text-[10px] tracking-wider border-b dark:border-slate-800">
                                            <tr>
                                                <th className="p-3 w-[40%]">Bahan Baku</th>
                                                <th className="p-3 text-right">Total Direncanakan</th>
                                                <th className="p-3 text-right">Sudah Diambil</th>
                                                <th className="p-3 text-right">Sisa Kebutuhan</th>
                                                <th className="p-3 text-center w-[20%]">Jumlah Diambil</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                                            {aggregatedItems.map(item => (
                                                <tr key={item.productVariantId} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/10">
                                                    <td className="p-3 font-medium">
                                                        <div className="font-bold text-slate-850 dark:text-slate-200">{item.variantName}</div>
                                                        <div className="text-[10px] text-muted-foreground font-mono">{item.skuCode}</div>
                                                    </td>
                                                    <td className="p-3 text-right text-slate-600 dark:text-slate-400">
                                                        {item.totalPlanned.toFixed(2)} {item.unit}
                                                    </td>
                                                    <td className="p-3 text-right text-slate-600 dark:text-slate-400">
                                                        {item.totalIssued.toFixed(2)} {item.unit}
                                                    </td>
                                                    <td className="p-3 text-right text-amber-600 dark:text-amber-500 font-bold">
                                                        {item.remainingNeed.toFixed(2)} {item.unit}
                                                    </td>
                                                    <td className="p-3 text-center">
                                                        <div className="flex items-center justify-center gap-1.5">
                                                            <Input
                                                                type="number"
                                                                step="0.0001"
                                                                min="0"
                                                                value={item.quantityToIssue === 0 ? '' : item.quantityToIssue}
                                                                onChange={(e) => handleQtyChange(item.productVariantId, e.target.value)}
                                                                className="h-8 w-24 text-right text-xs bg-slate-50/50 focus:bg-white dark:bg-slate-950/40 border dark:border-slate-800 font-bold"
                                                                placeholder="0"
                                                            />
                                                            <span className="text-[10px] font-bold text-slate-500 w-8 text-left">{item.unit}</span>
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

                    <DialogFooter className="p-6 border-t dark:border-slate-800 bg-slate-50 dark:bg-slate-950/20">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onClose}
                            disabled={isPending}
                            className="bg-white dark:bg-slate-900 border dark:border-slate-800"
                        >
                            Batal
                        </Button>
                        <Button
                            type="submit"
                            disabled={isPending}
                            className="bg-amber-600 hover:bg-amber-700 text-white font-bold"
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
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
