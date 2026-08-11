import { ExtendedProductionOrder } from './types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GitFork, AlertTriangle } from 'lucide-react';
import { createChildProductionOrder } from '@/actions/production/production';
import { getRealtimeStock } from '@/actions/inventory/inventory';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils/utils';
import { useEffect, useState } from 'react';
import { productionComponentLabels } from '@/lib/labels';
import { Location } from '@prisma/client';
import { resolveMaterialSourceLocationId } from '@/lib/locations/resolve-location';

interface ChildOrderListProps {
    order: ExtendedProductionOrder;
    locations?: Location[];
}

export function ChildOrderList({ order, locations = [] }: ChildOrderListProps) {
    const router = useRouter();
    const [isCreating, setIsCreating] = useState<string | null>(null);
    const [availableStock, setAvailableStock] = useState<
        Record<string, number>
    >({});
    const [checkingStock, setCheckingStock] = useState(false);

    // 1. Identify materials that *might* need a sub-order.
    // Logic: It is a planned material AND it is NOT a raw material (meaning: it has a ProductType that implies manufacturing, or has a BOM).
    // Simplified Logic: We look for materials that have type != 'RAW_MATERIAL' (e.g. INTERMEDIATE, WIP).
    // However, the best way is to check the ProductType relative to our system rules.

    // We filter list of materials that are likely intermediates/WIPs
    const intermediateMaterials = order.plannedMaterials.filter(
        (pm) =>
            ['INTERMEDIATE', 'WIP', 'FINISHED_GOOD'].includes(
                pm.productVariant.product.productType || '',
            ),
        // Note: productType might need to be fetched in the query if not present
    );

    // 2. Identify existing child orders
    const childOrders = order.childOrders || [];

    // 3. Map material -> total qty covered by child orders
    const coverageMap = new Map<string, number>();
    childOrders.forEach((co) => {
        // We assume the Child WO produces the same Variant as its BOM Output
        const producedVariantId = co.bom.productVariantId;
        const current = coverageMap.get(producedVariantId) || 0;
        coverageMap.set(
            producedVariantId,
            current + Number(co.plannedQuantity),
        );
    });

    const plannedQty = Number(order.plannedQuantity);
    const isBackflushCategory = [
        'MIXING',
        'EXTRUSION',
        'PACKING',
        'REWORK',
    ].includes(order.bom?.category || '');
    const actualQty = order.actualQuantity ? Number(order.actualQuantity) : 0;

    // 4. Map material -> total qty consumed/issued
    const issuedMap = new Map<string, number>();

    // A. Manual Issues
    order.materialIssues
        ?.filter((mi) => mi.status !== 'VOIDED')
        .forEach((mi) => {
            const current = issuedMap.get(mi.productVariantId) || 0;
            issuedMap.set(mi.productVariantId, current + Number(mi.quantity));
        });

    // B. Backflushed Quantities — only when there is NO explicit MaterialIssue
    // yet. Once material has been issued/transferred manually, that issue
    // already represents the consumption for this order; adding a backflush
    // estimate on top double-counts the same physical movement and understates
    // the real shortage (mirrors the guard in order-materials-tab.tsx /
    // order-execution-tab.tsx).
    const hasExplicitIssues =
        (order.materialIssues || []).filter((mi) => mi.status !== 'VOIDED')
            .length > 0;
    if (
        !hasExplicitIssues &&
        isBackflushCategory &&
        actualQty > 0 &&
        plannedQty > 0
    ) {
        (order.plannedMaterials || []).forEach((item) => {
            const backflushedQty =
                (actualQty / plannedQty) * Number(item.quantity);
            const current = issuedMap.get(item.productVariantId) || 0;
            issuedMap.set(item.productVariantId, current + backflushedQty);
        });
    }

    // 5. Materials that still need a sub-order (or a warehouse transfer).
    const materialsNeedingOrder = intermediateMaterials
        .map((mat) => {
            const coveredQty = coverageMap.get(mat.productVariantId) || 0;
            const issuedQty = issuedMap.get(mat.productVariantId) || 0;
            const requiredQty = Number(mat.quantity);
            const shortage = requiredQty - coveredQty - issuedQty;
            return { mat, shortage };
        })
        .filter((entry) => entry.shortage > 0.001);

    // 6. Check WIP/intermediate stock so the card doesn't push "Buat SPK" when
    // the shortage could just be transferred in from an existing warehouse.
    useEffect(() => {
        if (materialsNeedingOrder.length === 0) {
            setAvailableStock({});
            return;
        }
        let cancelled = false;
        setCheckingStock(true);
        Promise.all(
            materialsNeedingOrder.map(async ({ mat }) => {
                const locationId = resolveMaterialSourceLocationId(
                    locations,
                    mat.productVariant.product.productType,
                );
                if (!locationId) return [mat.productVariantId, 0] as const;
                try {
                    const res = await getRealtimeStock(
                        locationId,
                        mat.productVariantId,
                    );
                    return [
                        mat.productVariantId,
                        res.success && typeof res.data === 'number'
                            ? res.data
                            : 0,
                    ] as const;
                } catch {
                    return [mat.productVariantId, 0] as const;
                }
            }),
        ).then((entries) => {
            if (!cancelled) {
                setAvailableStock(Object.fromEntries(entries));
                setCheckingStock(false);
            }
        });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [order, locations]);

    const handleCreateSubOrder = async (
        materialId: string,
        quantity: number,
        variantName: string,
    ) => {
        setIsCreating(materialId);
        try {
            const result = await createChildProductionOrder(
                order.id,
                materialId,
                quantity,
            );
            if (result.success) {
                toast.success(
                    `Work Order berhasil dibuat untuk ${variantName}.`,
                );
                router.refresh();
            } else {
                toast.error(result.error || 'Gagal membuat sub-order');
            }
        } catch (_error) {
            toast.error('Gagal memproses. Silakan coba lagi.');
        } finally {
            setIsCreating(null);
        }
    };

    if (intermediateMaterials.length === 0 && childOrders.length === 0) {
        return null; // Nothing to show if only raw materials
    }

    return (
        <Card className="border-blue-100 dark:border-blue-900 bg-blue-50/20 dark:bg-blue-900/10">
            <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 text-blue-800 dark:text-blue-300">
                    <GitFork className="w-4 h-4" />{' '}
                    {productionComponentLabels.workOrders}
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Section 1: Missing / Required Sub-Orders */}
                {materialsNeedingOrder.map(({ mat, shortage }) => {
                    const stock = availableStock[mat.productVariantId];
                    const isStockSufficient =
                        stock !== undefined && stock >= shortage;
                    const isStockPartial =
                        stock !== undefined && stock > 0 && !isStockSufficient;

                    return (
                        <div
                            key={mat.id}
                            className="flex items-center justify-between p-3 bg-white dark:bg-card border border-blue-200 dark:border-blue-800/50 rounded-lg shadow-sm"
                        >
                            <div className="flex flex-col gap-1">
                                <span className="font-bold text-sm text-foreground flex items-center gap-2">
                                    <AlertTriangle className="w-3 h-3 text-amber-500" />
                                    {mat.productVariant.name}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    {
                                        productionComponentLabels.requiresProduction
                                    }
                                    :{' '}
                                    <span className="font-mono font-medium text-amber-600 dark:text-amber-500">
                                        {shortage.toFixed(2)}{' '}
                                        {String(mat.productVariant.primaryUnit)}
                                    </span>
                                </span>
                                {checkingStock && stock === undefined && (
                                    <span className="text-[10px] text-muted-foreground italic">
                                        {
                                            productionComponentLabels.checkingStock
                                        }
                                    </span>
                                )}
                                {stock !== undefined && (
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="text-[10px] text-muted-foreground">
                                            {
                                                productionComponentLabels.availableStock
                                            }
                                            :{' '}
                                            <span
                                                className={cn(
                                                    'font-mono font-semibold',
                                                    isStockSufficient
                                                        ? 'text-emerald-600 dark:text-emerald-500'
                                                        : isStockPartial
                                                          ? 'text-amber-600 dark:text-amber-500'
                                                          : 'text-muted-foreground',
                                                )}
                                            >
                                                {stock.toFixed(2)}{' '}
                                                {String(
                                                    mat.productVariant
                                                        .primaryUnit,
                                                )}
                                            </span>
                                        </span>
                                        {isStockSufficient && (
                                            <Badge
                                                variant="outline"
                                                className="text-[9px] h-4 px-1 border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400"
                                            >
                                                {
                                                    productionComponentLabels.stockSufficientHint
                                                }
                                            </Badge>
                                        )}
                                        {isStockPartial && (
                                            <Badge
                                                variant="outline"
                                                className="text-[9px] h-4 px-1 border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400"
                                            >
                                                {
                                                    productionComponentLabels.stockPartialHint
                                                }
                                            </Badge>
                                        )}
                                    </div>
                                )}
                            </div>
                            <Button
                                size="sm"
                                variant="outline"
                                className={cn(
                                    'border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20',
                                    isStockSufficient && 'opacity-50',
                                )}
                                disabled={isCreating === mat.productVariantId}
                                onClick={() =>
                                    handleCreateSubOrder(
                                        mat.productVariantId,
                                        shortage,
                                        mat.productVariant.name,
                                    )
                                }
                            >
                                {isCreating === mat.productVariantId
                                    ? productionComponentLabels.creating
                                    : productionComponentLabels.createWorkOrder}
                            </Button>
                        </div>
                    );
                })}

                {/* Section 2: Existing Child Orders */}
                {childOrders.length > 0 && (
                    <div className="space-y-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mt-4">
                            {productionComponentLabels.activeWorkOrders}
                        </h4>
                        {childOrders.map((child) => (
                            <div
                                key={child.id}
                                onClick={() =>
                                    router.push(
                                        `/production/orders/${child.id}`,
                                    )
                                }
                                className="cursor-pointer group flex items-center justify-between p-3 bg-white dark:bg-card border dark:border-border hover:border-blue-300 dark:hover:border-blue-500 transition-colors rounded-lg"
                            >
                                <div className="flex items-center gap-3">
                                    <div
                                        className={cn(
                                            'w-2 h-2 rounded-full',
                                            child.status === 'COMPLETED'
                                                ? 'bg-emerald-500'
                                                : child.status === 'IN_PROGRESS'
                                                  ? 'bg-amber-500'
                                                  : 'bg-zinc-300',
                                        )}
                                    />
                                    <div className="flex flex-col">
                                        <span className="font-medium text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                            {child.orderNumber}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            {child.bom.productVariant.name}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-xs font-mono">
                                        {Number(child.plannedQuantity)} Qty
                                    </span>
                                    <Badge
                                        variant="secondary"
                                        className="text-[10px] h-5"
                                    >
                                        {child.status}
                                    </Badge>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
