import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, ShoppingCart, ArrowRight } from 'lucide-react';
import { ProductionStatus } from '@prisma/client';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function PpicMrpPage() {
    // 1. Fetch active production orders and their material requirements
    const pendingOrders = await prisma.productionOrder.findMany({
        where: {
            status: { in: [ProductionStatus.DRAFT, ProductionStatus.RELEASED] }
        },
        include: {
            bom: {
                include: {
                    items: {
                        include: {
                            productVariant: true
                        }
                    }
                }
            }
        }
    });

    // 2. Fetch current RM inventory
    const rmInventory = await prisma.inventory.findMany({
        where: { location: { slug: 'rm_warehouse' } },
        include: { productVariant: true }
    });

    // 3. Aggregate requirements
    const requirementsMap = new Map<string, { name: string, sku: string, totalReq: number, unit: string }>();

    pendingOrders.forEach(order => {
        const multiplier = Number(order.plannedQuantity) / Number(order.bom.outputQuantity);
        order.bom.items.forEach(item => {
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
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Material Planning (MRP)</h1>
                    <p className="text-muted-foreground">Shortage analysis based on pending production orders.</p>
                </div>
                <div className="flex gap-3">
                    <Link href="/dashboard/purchasing/orders/create">
                        <Button className="bg-emerald-600 hover:bg-emerald-700">
                            <ShoppingCart className="mr-2 h-4 w-4" />
                            Create Bulk PO
                        </Button>
                    </Link>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Pending Orders</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{pendingOrders.length}</div>
                        <p className="text-xs text-muted-foreground mt-1">Requiring materials</p>
                    </CardContent>
                </Card>
                <Card className={totalShortages > 0 ? "border-red-200 bg-red-50/30" : ""}>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground font-bold">Shortages Detected</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className={cn("text-2xl font-bold", totalShortages > 0 ? "text-red-600" : "text-emerald-600")}>
                            {totalShortages} Items
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Action items for Purchasing</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">RM Inventory Value</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">Active Monitoring</div>
                        <p className="text-xs text-muted-foreground mt-1">Real-time sync with RM Warehouse</p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Requirements Analysis</CardTitle>
                    <CardDescription>Consolidated demand vs current stock in RM Warehouse.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Material</TableHead>
                                <TableHead className="text-right">Total Demand</TableHead>
                                <TableHead className="text-right">Current Stock</TableHead>
                                <TableHead className="text-right">Shortage</TableHead>
                                <TableHead className="text-right"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {analysis.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                                        No material demand detected for pending orders.
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
                                        <TableCell className="text-right font-bold text-red-600">
                                            {item.hasShortage ? `${item.shortage.toLocaleString()} ${item.unit}` : '-'}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {item.hasShortage ? (
                                                <Link href={`/dashboard/purchasing/orders/create?variantId=${item.sku}`}>
                                                    <Button variant="ghost" size="sm" className="text-red-700 hover:text-red-800 hover:bg-red-100 h-8 gap-1">
                                                        Purchase <ArrowRight className="h-3 w-3" />
                                                    </Button>
                                                </Link>
                                            ) : (
                                                <Badge variant="outline" className="text-emerald-600 bg-emerald-50 border-emerald-100">Covered</Badge>
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
                <div className="flex items-center gap-2 p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
                    <AlertCircle className="h-5 w-5" />
                    <span className="text-sm font-medium">
                        You have {totalShortages} materials with insufficient stock to fulfill planned production.
                    </span>
                </div>
            )}
        </div>
    );
}

function cn(...inputs: (string | boolean | undefined | null)[]) {
    return inputs.filter(Boolean).join(' ');

}
