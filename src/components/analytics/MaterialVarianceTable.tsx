'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MaterialUsageVarianceItem } from '@/types/analytics';

interface Props {
    data: MaterialUsageVarianceItem[];
}

export function MaterialVarianceTable({ data }: Props) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Material Usage Variance</CardTitle>
                <CardDescription>
                    Comparison of standard vs actual material consumption. Positive variance means excess usage.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {data.length === 0 ? (
                    <p className="text-muted-foreground py-8 text-center text-sm">No material usage data found.</p>
                ) : (
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Order #</TableHead>
                                    <TableHead>Material</TableHead>
                                    <TableHead className="text-right">Standard</TableHead>
                                    <TableHead className="text-right">Actual</TableHead>
                                    <TableHead className="text-right">Variance</TableHead>
                                    <TableHead className="text-right">% Var</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.map((item, idx) => {
                                    const isHighVariance = Math.abs(item.variancePercentage) > 5;
                                    const varianceColor = item.variance > 0 ? 'text-red-600' : 'text-green-600'; // Positive variance = waste usually

                                    return (
                                        <TableRow key={`${item.orderNumber}-${item.materialSku}-${idx}`}>
                                            <TableCell className="font-medium">{item.orderNumber}</TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span>{item.materialName}</span>
                                                    <span className="text-xs text-muted-foreground">{item.materialSku}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">{item.standardQuantity.toLocaleString()}</TableCell>
                                            <TableCell className="text-right">{item.actualQuantity.toLocaleString()}</TableCell>
                                            <TableCell className={`text-right font-medium ${varianceColor}`}>
                                                {item.variance > 0 ? '+' : ''}{item.variance.toLocaleString()}
                                            </TableCell>
                                            <TableCell className={`text-right font-bold ${isHighVariance ? 'bg-red-50' : ''} ${varianceColor}`}>
                                                {item.variance > 0 ? '+' : ''}{item.variancePercentage.toFixed(2)}%
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
