
import { CostingService } from '@/services/costing-service';
import { formatRupiah } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, Filter, TrendingUp, Package, Users, Settings } from 'lucide-react';

export default async function CostingPage(props: { searchParams: Promise<{ start?: string; end?: string }> }) {
    const searchParams = await props.searchParams;

    const startDate = searchParams.start ? new Date(searchParams.start) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const endDate = searchParams.end ? new Date(searchParams.end) : new Date();

    const costs = await CostingService.getPeriodCosts(startDate, endDate);

    const totalCOGM = costs.reduce((sum, c) => sum + c.totalCost, 0);
    const totalMaterial = costs.reduce((sum, c) => sum + c.materialCost, 0);
    const totalLabor = costs.reduce((sum, c) => sum + c.laborCost, 0);
    const totalMachine = costs.reduce((sum, c) => sum + c.machineCost, 0);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Costing Dashboard</h1>
                    <p className="text-muted-foreground">
                        Production cost analysis and COGM tracking.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline">
                        <Filter className="mr-2 h-4 w-4" />
                        Filters
                    </Button>
                    <Button variant="outline">
                        <FileText className="mr-2 h-4 w-4" />
                        Export
                    </Button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Total COGM</CardTitle>
                        <TrendingUp className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatRupiah(totalCOGM)}</div>
                        <p className="text-xs text-muted-foreground mt-1">Cost of Goods Manufactured</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Material Share</CardTitle>
                        <Package className="h-4 w-4 text-emerald-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatRupiah(totalMaterial)}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {totalCOGM > 0 ? ((totalMaterial / totalCOGM) * 100).toFixed(1) : 0}% of total
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Labor Share</CardTitle>
                        <Users className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatRupiah(totalLabor)}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {totalCOGM > 0 ? ((totalLabor / totalCOGM) * 100).toFixed(1) : 0}% of total
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Machine Share</CardTitle>
                        <Settings className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatRupiah(totalMachine)}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {totalCOGM > 0 ? ((totalMachine / totalCOGM) * 100).toFixed(1) : 0}% of total
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Detailed Cost Breakdown</CardTitle>
                    <CardDescription>Costs per completed production order.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Order #</TableHead>
                                    <TableHead className="text-right">Qty</TableHead>
                                    <TableHead className="text-right">Material</TableHead>
                                    <TableHead className="text-right">Labor</TableHead>
                                    <TableHead className="text-right">Machine</TableHead>
                                    <TableHead className="text-right font-bold">Total Cost</TableHead>
                                    <TableHead className="text-right">Unit Cost</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {costs.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center h-24 text-muted-foreground">
                                            No costing data for selected period.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    costs.map((cost) => (
                                        <TableRow key={cost.productionOrderId}>
                                            <TableCell className="font-mono font-medium">{cost.orderNumber}</TableCell>
                                            <TableCell className="text-right">{cost.quantityProduced}</TableCell>
                                            <TableCell className="text-right text-muted-foreground">{formatRupiah(cost.materialCost)}</TableCell>
                                            <TableCell className="text-right text-muted-foreground">{formatRupiah(cost.laborCost)}</TableCell>
                                            <TableCell className="text-right text-muted-foreground">{formatRupiah(cost.machineCost)}</TableCell>
                                            <TableCell className="text-right font-bold">{formatRupiah(cost.totalCost)}</TableCell>
                                            <TableCell className="text-right">
                                                <Badge variant="outline">{formatRupiah(cost.unitCost)}</Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
