'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ProductionRealizationItem } from '@/types/analytics';
import { Progress } from '@/components/ui/progress';

interface Props {
    data: ProductionRealizationItem[];
}

export function ProductionRealizationTable({ data }: Props) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Production Realization</CardTitle>
                <CardDescription>
                    Yield rates and schedule adherence for production orders.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {data.length === 0 ? (
                    <p className="text-muted-foreground py-8 text-center text-sm">No production data found for this period.</p>
                ) : (
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Order #</TableHead>
                                    <TableHead>Product</TableHead>
                                    <TableHead className="text-right">Planned</TableHead>
                                    <TableHead className="text-right">Actual</TableHead>
                                    <TableHead className="w-[150px]">Yield Rate</TableHead>
                                    <TableHead>Adherence</TableHead>
                                    <TableHead>Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.map((item) => (
                                    <TableRow key={item.orderNumber}>
                                        <TableCell className="font-medium">{item.orderNumber}</TableCell>
                                        <TableCell>{item.productName}</TableCell>
                                        <TableCell className="text-right text-muted-foreground">{item.plannedQuantity.toLocaleString()}</TableCell>
                                        <TableCell className="text-right font-medium">{item.actualQuantity.toLocaleString()}</TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Progress value={Math.min(item.yieldRate, 100)} className={`h-2 ${item.yieldRate < 90 ? 'bg-red-100' : 'bg-green-100'}`} />
                                                <span className={`text-xs font-medium ${item.yieldRate < 90 ? 'text-red-600' : 'text-green-600'}`}>
                                                    {item.yieldRate.toFixed(1)}%
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={
                                                item.scheduleAdherence === 'On Time' ? 'outline' : // was 'success' but not standard
                                                    item.scheduleAdherence === 'Early' ? 'secondary' :
                                                        item.scheduleAdherence === 'Late' ? 'destructive' : 'secondary'
                                            } className={
                                                item.scheduleAdherence === 'On Time' ? 'bg-green-50 text-green-700 border-green-200' : ''
                                            }>
                                                {item.scheduleAdherence}
                                                {item.delayDays > 0 && ` (+${item.delayDays}d)`}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-xs text-muted-foreground">{item.status}</span>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
