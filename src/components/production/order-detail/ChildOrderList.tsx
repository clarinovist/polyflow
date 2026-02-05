import { ExtendedProductionOrder } from './types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GitFork, AlertTriangle } from 'lucide-react';
import { createChildProductionOrder } from '@/actions/production';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface ChildOrderListProps {
    order: ExtendedProductionOrder;
}

export function ChildOrderList({ order }: ChildOrderListProps) {
    const router = useRouter();
    const [isCreating, setIsCreating] = useState<string | null>(null);

    // 1. Identify materials that *might* need a sub-order.
    // Logic: It is a planned material AND it is NOT a raw material (meaning: it has a ProductType that implies manufacturing, or has a BOM).
    // Simplified Logic: We look for materials that have type != 'RAW_MATERIAL' (e.g. INTERMEDIATE, WIP).
    // However, the best way is to check the ProductType relative to our system rules.

    // We filter list of materials that are likely intermediates/WIPs
    const intermediateMaterials = order.plannedMaterials.filter(pm =>
        ['INTERMEDIATE', 'WIP', 'FINISHED_GOOD'].includes(pm.productVariant.product.productType || '')
        // Note: productType might need to be fetched in the query if not present
    );

    // 2. Identify existing child orders
    const childOrders = order.childOrders || [];

    // 3. Map material -> total qty covered by child orders
    const coverageMap = new Map<string, number>();
    childOrders.forEach(co => {
        // We assume the Child WO produces the same Variant as its BOM Output
        const producedVariantId = co.bom.productVariantId;
        const current = coverageMap.get(producedVariantId) || 0;
        coverageMap.set(producedVariantId, current + Number(co.plannedQuantity));
    });

    // 4. Map material -> total qty issued (manual issues satisfy production requirement)
    const issuedMap = new Map<string, number>();
    order.materialIssues?.forEach(mi => {
        const current = issuedMap.get(mi.productVariantId) || 0;
        issuedMap.set(mi.productVariantId, current + Number(mi.quantity));
    });

    const handleCreateSubOrder = async (materialId: string, quantity: number, variantName: string) => {
        setIsCreating(materialId);
        try {
            const result = await createChildProductionOrder(order.id, materialId, quantity);
            if (result.success) {
                toast.success(`Work Order created for ${variantName}`);
                router.refresh();
            } else {
                toast.error(result.error || "Failed to create sub-order");
            }
        } catch (_error) {
            toast.error("An unexpected error occurred");
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
                    <GitFork className="w-4 h-4" /> Work Orders
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">

                {/* Section 1: Missing / Required Sub-Orders */}
                {intermediateMaterials.map(mat => {
                    const coveredQty = coverageMap.get(mat.productVariantId) || 0;
                    const issuedQty = issuedMap.get(mat.productVariantId) || 0;
                    const requiredQty = Number(mat.quantity);
                    const shortage = requiredQty - coveredQty - issuedQty;

                    if (shortage <= 0.001) return null; // Fully covered

                    return (
                        <div key={mat.id} className="flex items-center justify-between p-3 bg-white dark:bg-card border border-blue-200 dark:border-blue-800/50 rounded-lg shadow-sm">
                            <div className="flex flex-col">
                                <span className="font-bold text-sm text-foreground flex items-center gap-2">
                                    <AlertTriangle className="w-3 h-3 text-amber-500" />
                                    {mat.productVariant.name}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    Requires Production: <span className="font-mono font-medium text-amber-600 dark:text-amber-500">{shortage.toFixed(2)} {String(mat.productVariant.primaryUnit)}</span>
                                </span>
                            </div>
                            <Button
                                size="sm"
                                variant="outline"
                                className="border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                disabled={isCreating === mat.productVariantId}
                                onClick={() => handleCreateSubOrder(mat.productVariantId, shortage, mat.productVariant.name)}
                            >
                                {isCreating === mat.productVariantId ? "Creating..." : "Create Work Order"}
                            </Button>
                        </div>
                    );
                })}

                {/* Section 2: Existing Child Orders */}
                {childOrders.length > 0 && (
                    <div className="space-y-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mt-4">Active Work Orders</h4>
                        {childOrders.map(child => (
                            <div key={child.id} onClick={() => router.push(`/planning/orders/${child.id}`)} className="cursor-pointer group flex items-center justify-between p-3 bg-white dark:bg-card border dark:border-border hover:border-blue-300 dark:hover:border-blue-500 transition-colors rounded-lg">
                                <div className="flex items-center gap-3">
                                    <div className={cn("w-2 h-2 rounded-full",
                                        child.status === 'COMPLETED' ? "bg-emerald-500" :
                                            child.status === 'IN_PROGRESS' ? "bg-amber-500" : "bg-zinc-300"
                                    )} />
                                    <div className="flex flex-col">
                                        <span className="font-medium text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{child.orderNumber}</span>
                                        <span className="text-xs text-muted-foreground">{child.bom.productVariant.name}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-xs font-mono">{Number(child.plannedQuantity)} Qty</span>
                                    <Badge variant="secondary" className="text-[10px] h-5">{child.status}</Badge>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
