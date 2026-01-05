import { getStockMovements } from '@/actions/inventory';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

export default async function HistoryPage() {
    const movements = await getStockMovements(100);

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold tracking-tight">Stock Movement History</h2>

            <Card>
                <CardHeader>
                    <CardTitle>Recent Movements</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Product</TableHead>
                                <TableHead className="text-right">Qty</TableHead>
                                <TableHead>From</TableHead>
                                <TableHead>To</TableHead>
                                <TableHead>Reference</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {movements.map((movement) => (
                                <TableRow key={movement.id}>
                                    <TableCell className="whitespace-nowrap">
                                        {format(new Date(movement.createdAt), 'dd MMM yyyy HH:mm')}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={
                                            movement.type === 'IN' || movement.type === 'ADJUSTMENT' && movement.toLocationId ? 'default' :
                                                movement.type === 'OUT' || movement.type === 'ADJUSTMENT' && movement.fromLocationId ? 'destructive' :
                                                    'secondary'
                                        }>
                                            {movement.type}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="font-medium">{movement.productVariant.name}</div>
                                        <div className="text-xs text-muted-foreground">{movement.productVariant.skuCode}</div>
                                    </TableCell>
                                    <TableCell className="text-right font-mono">
                                        {movement.quantity.toNumber()}
                                    </TableCell>
                                    <TableCell>{movement.fromLocation?.name || '-'}</TableCell>
                                    <TableCell>{movement.toLocation?.name || '-'}</TableCell>
                                    <TableCell className="text-sm text-muted-foreground">{movement.reference || '-'}</TableCell>
                                </TableRow>
                            ))}
                            {movements.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center h-24 text-muted-foreground">
                                        No movements found.
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
