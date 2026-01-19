'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatRupiah } from '@/lib/utils';
import { ARAgingItem } from '@/types/analytics';

interface ARAgingCardProps {
    data: ARAgingItem[];
}

export function ARAgingCard({ data }: ARAgingCardProps) {
    if (!data.length) return null;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Accounts Receivable Aging</CardTitle>
                <CardDescription>Unpaid invoices by age</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Aging Period</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="text-right">Count</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data.map((item) => (
                            <TableRow key={item.range}>
                                <TableCell className="font-medium">
                                    <Badge variant={(item.range === 'Current' || item.range === '1-30 Days') ? 'outline' : 'destructive'} className="whitespace-nowrap">
                                        {item.range}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right font-bold text-sm">
                                    {formatRupiah(item.amount)}
                                </TableCell>
                                <TableCell className="text-right text-muted-foreground text-xs">
                                    {item.invoiceCount} inv
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
