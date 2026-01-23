import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Boxes, PackageOpen, ArrowRightLeft, TrendingDown, ClipboardCheck } from 'lucide-react';
import AcknowledgeHandoverButton from '@/components/production/AcknowledgeHandoverButton';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function ProductionInventoryPage() {
    // 1. Fetch Current Floor Stock (Mixing Area)
    const floorInventory = await prisma.inventory.findMany({
        where: { location: { slug: 'mixing_area' } },
        include: {
            productVariant: {
                include: { product: true }
            }
        },
        orderBy: { quantity: 'desc' }
    });

    // 2. Fetch Recent Handover Activity (Recent Transfers to Mixing Area)
    const recentHandovers = await prisma.stockMovement.findMany({
        where: {
            toLocation: { slug: 'mixing_area' },
            type: 'TRANSFER'
        },
        include: {
            productVariant: true,
            fromLocation: true,
            createdBy: true
        },
        orderBy: { createdAt: 'desc' },
        take: 5
    });

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Floor Stock & Handover</h2>
                    <p className="text-muted-foreground">Manage materials currently on the production floor.</p>
                </div>
                <div className="flex gap-3">
                    <Link href="/dashboard/inventory/transfer">
                        <Button variant="outline" className="text-xs h-9">
                            <ArrowRightLeft className="mr-2 h-4 w-4" />
                            Request Materials
                        </Button>
                    </Link>
                    <Button className="bg-emerald-600 hover:bg-emerald-700 text-xs h-9">
                        <ClipboardCheck className="mr-2 h-4 w-4" />
                        Stock Opname Floor
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Stock Table */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Boxes className="h-5 w-5 text-emerald-600" />
                            Mixing Area Inventory
                        </CardTitle>
                        <CardDescription>Available materials ready for the machines.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Product</TableHead>
                                    <TableHead>SKU</TableHead>
                                    <TableHead className="text-right">Quantity</TableHead>
                                    <TableHead className="text-right">Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {floorInventory.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                                            No stock found in Mixing Area.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    floorInventory.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell>
                                                <div className="font-medium">{item.productVariant.name}</div>
                                                <div className="text-[10px] text-muted-foreground uppercase">{item.productVariant.product.productType}</div>
                                            </TableCell>
                                            <TableCell className="font-mono text-xs">{item.productVariant.skuCode}</TableCell>
                                            <TableCell className="text-right font-bold">
                                                {Number(item.quantity).toLocaleString()} <span className="text-[10px] font-normal text-muted-foreground">{item.productVariant.primaryUnit}</span>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {Number(item.quantity) < 100 ? (
                                                    <Badge variant="destructive" className="text-[10px]">Restock Soon</Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50 text-[10px]">Ready</Badge>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                {/* Handover Activity Feed */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader className="pb-3 border-b">
                            <CardTitle className="text-base flex items-center gap-2">
                                <PackageOpen className="h-4 w-4 text-blue-600" />
                                Incoming Handover
                            </CardTitle>
                            <CardDescription className="text-xs">Recent incoming from warehouse.</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-4 px-0">
                            <div className="relative">
                                <div className="absolute left-6 top-0 bottom-0 w-px bg-slate-100 dark:bg-slate-800" />
                                <div className="space-y-6">
                                    {recentHandovers.length === 0 ? (
                                        <p className="text-center text-xs text-muted-foreground py-4 italic">No recent activity.</p>
                                    ) : (
                                        recentHandovers.map((move) => (
                                            <div key={move.id} className="relative pl-12 pr-6">
                                                <div className="absolute left-4 top-1 h-4 w-4 rounded-full bg-white dark:bg-slate-900 border-2 border-blue-500 z-10" />
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex justify-between items-start">
                                                        <span className="text-xs font-bold">{move.productVariant.name}</span>
                                                        <span className="text-[9px] text-muted-foreground whitespace-nowrap">
                                                            {new Date(move.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>
                                                    <div className="text-[10px] text-blue-600 font-medium">
                                                        +{Number(move.quantity).toLocaleString()} {move.productVariant.primaryUnit}
                                                    </div>
                                                    <div className="text-[9px] text-muted-foreground flex items-center gap-1 mt-1">
                                                        From: {move.fromLocation?.name || 'Main Warehouse'}
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-2">
                                                        <div className="h-5 w-5 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[8px] font-bold">
                                                            {move.createdBy?.name?.charAt(0) || 'S'}
                                                        </div>
                                                        <span className="text-[9px] text-muted-foreground">By {move.createdBy?.name || 'System'}</span>
                                                        <div className="ml-auto">
                                                            {/* Client component */}
                                                                <AcknowledgeHandoverButton movementId={move.id} />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                            <div className="px-6 mt-6">
                                <Button className="w-full text-xs" variant="outline" size="sm">
                                    View All Activity
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Floor Scrap Summary */}
                    <Card className="bg-slate-50 dark:bg-slate-900 border-dashed">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                <TrendingDown className="h-4 w-4 text-red-500" />
                                Scrap Floor Control
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-xs text-muted-foreground">Jangan biarkan afval menumpuk di area mixing.</p>
                            <div className="mt-4 flex items-center justify-between">
                                <span className="text-xs font-semibold">Today&apos;s Scrap:</span>
                                <span className="text-sm font-bold text-red-600">12.4 KG</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
