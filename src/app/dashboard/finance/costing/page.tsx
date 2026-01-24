
import { CostingService } from '@/services/costing-service';
import { formatRupiah } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText } from 'lucide-react';

export default async function CostingDashboardPage() {
    // Determine last month range for default view
    const today = new Date();
    const _startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // In a real app, these would come from searchParams
    const costs = await CostingService.getPeriodCosts();

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Cost Accounting</h1>
                    <p className="text-muted-foreground">
                        Production Cost Analysis (COGM)
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline">
                        <FileText className="mr-2 h-4 w-4" />
                        Export Report
                    </Button>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Production Orders Cost Sheet</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Order #</TableHead>
                                <TableHead className="text-right">Qty Produced</TableHead>
                                <TableHead className="text-right">Material Cost</TableHead>
                                <TableHead className="text-right">Machine Cost</TableHead>
                                <TableHead className="text-right">Labor Cost</TableHead>
                                <TableHead className="text-right">Total COGM</TableHead>
                                <TableHead className="text-right">Unit Cost</TableHead>
                                <TableHead className="w-[100px]">Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {costs.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-center h-24 text-muted-foreground">
                                        No production data found for analysis.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                costs.map((cost) => (
                                    <TableRow key={cost.productionOrderId}>
                                        <TableCell className="font-medium font-mono">
                                            {cost.orderNumber}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {cost.quantityProduced.toLocaleString('id-ID')}
                                        </TableCell>
                                        <TableCell className="text-right text-muted-foreground">
                                            {formatRupiah(cost.materialCost)}
                                        </TableCell>
                                        <TableCell className="text-right text-muted-foreground">
                                            {formatRupiah(cost.machineCost)}
                                        </TableCell>
                                        <TableCell className="text-right text-muted-foreground">
                                            {formatRupiah(cost.laborCost)}
                                        </TableCell>
                                        <TableCell className="text-right font-bold">
                                            {formatRupiah(cost.totalCost)}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Badge variant="outline">
                                                {formatRupiah(cost.unitCost)}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Button variant="ghost" size="sm">
                                                Detail
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
