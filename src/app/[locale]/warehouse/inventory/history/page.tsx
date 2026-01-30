import { getStockMovements } from '@/actions/inventory';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft, History } from 'lucide-react';
import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Movement History | PolyFlow Warehouse',
};

export default async function WarehouseHistoryPage() {
    const movements = await getStockMovements(100);

    return (
        <div className="space-y-6">
            <Card className="border shadow-sm overflow-hidden">
                <CardHeader className="bg-muted/10 border-b py-3 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
                            <History className="h-4 w-4" />
                        </div>
                        <div>
                            <CardTitle className="text-lg font-bold text-foreground">Stock Movement History</CardTitle>
                            <p className="text-xs text-muted-foreground">Track all inventory transactions (Last 100)</p>
                        </div>
                    </div>
                    <Button variant="ghost" size="sm" asChild className="h-8 text-xs">
                        <Link href="/warehouse/inventory">
                            <ArrowLeft className="mr-2 h-3 w-3" /> Back to Inventory
                        </Link>
                    </Button>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/10">
                                <TableHead className="pl-6">Date</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Product</TableHead>
                                <TableHead className="text-right">Qty</TableHead>
                                <TableHead>From Location</TableHead>
                                <TableHead>To Location</TableHead>
                                <TableHead className="pr-6">Reference</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {movements.map((movement) => (
                                <TableRow key={movement.id} className="hover:bg-muted/5 transition-colors">
                                    <TableCell className="whitespace-nowrap pl-6 text-sm">
                                        {format(new Date(movement.createdAt), 'dd MMM yyyy HH:mm')}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={
                                            movement.type === 'IN' || (movement.type === 'ADJUSTMENT' && movement.toLocationId && !movement.fromLocationId) ? 'default' :
                                                movement.type === 'OUT' || (movement.type === 'ADJUSTMENT' && movement.fromLocationId && !movement.toLocationId) ? 'destructive' :
                                                    'secondary'
                                        } className="font-semibold text-[10px] uppercase tracking-wider">
                                            {movement.type}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="font-semibold text-sm text-foreground">{movement.productVariant.name}</div>
                                        <div className="text-[11px] text-muted-foreground font-mono">{movement.productVariant.skuCode}</div>
                                    </TableCell>
                                    <TableCell className="text-right font-mono font-bold text-foreground">
                                        {movement.quantity.toNumber() > 0 ? `+${movement.quantity.toNumber()}` : movement.quantity.toNumber()}
                                    </TableCell>
                                    <TableCell className="text-sm">{movement.fromLocation?.name || <span className="text-muted-foreground/50">-</span>}</TableCell>
                                    <TableCell className="text-sm">{movement.toLocation?.name || <span className="text-muted-foreground/50">-</span>}</TableCell>
                                    <TableCell className="text-sm text-muted-foreground pr-6 font-mono truncate max-w-[150px]">{movement.reference || '-'}</TableCell>
                                </TableRow>
                            ))}
                            {movements.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center h-48 text-muted-foreground">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <History className="h-8 w-8 opacity-20" />
                                            <p>No stock movements found.</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
