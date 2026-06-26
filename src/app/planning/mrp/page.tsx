import { getProductionOrders } from '@/actions/production/production-orders';
import { getInventoryList } from '@/actions/inventory/inventory';
import { WAREHOUSE_SLUGS } from '@/lib/constants/locations';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, ShoppingCart, ArrowRight, CheckCircle2 } from 'lucide-react';
import { ProductionStatus } from '@prisma/client';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { planningLabels } from '@/lib/labels';

export const dynamic = 'force-dynamic';

export default async function PpicMrpPage() {
    // 1. Fetch active production orders and their material requirements
    const ordersRes = await getProductionOrders();
    const allOrders = ordersRes;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pendingOrders = (allOrders as any[]).filter((o: any) =>
        [ProductionStatus.DRAFT, ProductionStatus.RELEASED].includes(o.status)
    );

    // 2. Fetch current RM inventory
    const inventoryRes = await getInventoryList();
    const allInventory = inventoryRes.success && inventoryRes.data ? inventoryRes.data : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rmInventory = (allInventory as any[]).filter((item: any) => item.location?.slug === WAREHOUSE_SLUGS.RAW_MATERIAL);

    // 3. Aggregate requirements
    const requirementsMap = new Map<string, { name: string, sku: string, totalReq: number, unit: string }>();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pendingOrders.forEach((order: any) => {
        const multiplier = Number(order.plannedQuantity) / Number(order.bom.outputQuantity);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        order.bom.items.forEach((item: any) => {
            const existing = requirementsMap.get(item.productVariantId) || {
                name: item.productVariant.name,
                sku: item.productVariant.skuCode,
                totalReq: 0,
                unit: item.productVariant.primaryUnit
            };
            existing.totalReq += Number(item.quantity) * multiplier;
            requirementsMap.set(item.productVariantId, existing);
        });
    });

    // 4. Join with Inventory to find shortages
    const analysis = Array.from(requirementsMap.entries()).map(([id, req]) => {
        const inventory = rmInventory.find(inv => inv.productVariantId === id);
        const stock = Number(inventory?.quantity || 0);
        const shortage = Math.max(0, req.totalReq - stock);
        return {
            ...req,
            stock,
            shortage,
            hasShortage: shortage > 0
        };
    }).sort((a, b) => (b.hasShortage ? 1 : 0) - (a.hasShortage ? 1 : 0));

    const totalShortages = analysis.filter(a => a.hasShortage).length;

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">{planningLabels.materialPlanning}</h1>
                    <p className="text-muted-foreground">{planningLabels.shortageAnalysis}</p>
                </div>
                <div className="flex gap-3">
                    <Link href="/purchasing/orders/create">
                        <Button className="bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600">
                            <ShoppingCart className="mr-2 h-4 w-4" />
                            {planningLabels.createBulkPO}
                        </Button>
                    </Link>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">{planningLabels.pendingOrders}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{pendingOrders.length}</div>
                        <p className="text-xs text-muted-foreground mt-1">{planningLabels.requiringMaterials}</p>
                    </CardContent>
                </Card>
                <Card className={totalShortages > 0 ? "border-red-200 bg-red-50/30 dark:border-red-800/50 dark:bg-red-900/20" : ""}>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground font-bold">{planningLabels.shortagesDetected}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className={cn("text-2xl font-bold", totalShortages > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400")}>
                            {totalShortages} {planningLabels.material}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{planningLabels.actionForPurchasing}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">{planningLabels.rmInventoryValue}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{planningLabels.activeMonitoring}</div>
                        <p className="text-xs text-muted-foreground mt-1">{planningLabels.realTimeSync}</p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>{planningLabels.requirementsAnalysis}</CardTitle>
                    <CardDescription>{planningLabels.consolidatedDemand}</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{planningLabels.material}</TableHead>
                                <TableHead className="text-right">{planningLabels.totalDemand}</TableHead>
                                <TableHead className="text-right">{planningLabels.currentStock}</TableHead>
                                <TableHead className="text-right">{planningLabels.shortage}</TableHead>
                                <TableHead className="text-right"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {analysis.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-64 text-center">
                                        <div className="flex flex-col items-center justify-center space-y-3">
                                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                                                <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                                            </div>
                                            <div className="space-y-1">
                                                <h3 className="text-lg font-medium">{planningLabels.noShortages}</h3>
                                                <p className="text-muted-foreground">
                                                    {planningLabels.sufficientMaterial}
                                                </p>
                                            </div>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                analysis.map((item) => (
                                    <TableRow key={item.sku} className={item.hasShortage ? "bg-red-50/50 dark:bg-red-900/10" : ""}>
                                        <TableCell>
                                            <div className="font-medium">{item.name}</div>
                                            <div className="text-xs font-mono text-muted-foreground">{item.sku}</div>
                                        </TableCell>
                                        <TableCell className="text-right font-medium">
                                            {item.totalReq.toLocaleString()} {item.unit}
                                        </TableCell>
                                        <TableCell className="text-right text-muted-foreground">
                                            {item.stock.toLocaleString()} {item.unit}
                                        </TableCell>
                                        <TableCell className="text-right font-bold text-red-600 dark:text-red-400">
                                            {item.hasShortage ? `${item.shortage.toLocaleString()} ${item.unit}` : '-'}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {item.hasShortage ? (
                                                <Link href={`/purchasing/orders/create?variantId=${item.sku}`}>
                                                    <Button variant="ghost" size="sm" className="text-red-700 hover:text-red-800 hover:bg-red-100 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-900/30 h-8 gap-1">
                                                        {planningLabels.purchase} <ArrowRight className="h-3 w-3" />
                                                    </Button>
                                                </Link>
                                            ) : (
                                                <Badge variant="outline" className="text-emerald-600 bg-emerald-50 border-emerald-100 dark:text-emerald-400 dark:bg-emerald-900/20 dark:border-emerald-800/50">{planningLabels.covered}</Badge>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {totalShortages > 0 && (
                <div className="flex items-center gap-2 p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-800/50 dark:text-amber-400">
                    <AlertCircle className="h-5 w-5" />
                    <span className="text-sm font-medium">
                        {planningLabels.insufficientStock(totalShortages)}
                    </span>
                </div>
            )}
        </div>
    );
}

function cn(...inputs: (string | boolean | undefined | null)[]) {
    return inputs.filter(Boolean).join(' ');
}
