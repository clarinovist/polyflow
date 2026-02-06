'use client';

import React from 'react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { formatRupiah } from '@/lib/utils';

interface HistoryItem {
    id: string;
    type: 'AR' | 'AP';
    invoiceNumber: string;
    entityName: string;
    date: string | Date;
    amount: number;
    createdAt: string | Date;
}

interface OpeningBalanceHistoryProps {
    data: HistoryItem[];
}

export function OpeningBalanceHistory({ data }: OpeningBalanceHistoryProps) {
    if (data.length === 0) return null;

    return (
        <Card className="mt-8">
            <CardHeader>
                <CardTitle>Recent Opening Balances</CardTitle>
                <CardDescription>
                    The most recent outstanding invoices recorded in the system.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Invoice #</TableHead>
                                <TableHead>Customer/Supplier</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.map((item) => (
                                <TableRow key={item.id}>
                                    <TableCell>
                                        {format(new Date(item.date), 'dd MMM yyyy')}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={item.type === 'AR' ? 'default' : 'secondary'}>
                                            {item.type === 'AR' ? 'Receivable (AR)' : 'Payable (AP)'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">{item.invoiceNumber}</TableCell>
                                    <TableCell>{item.entityName}</TableCell>
                                    <TableCell className="text-right font-medium">
                                        {formatRupiah(item.amount)}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}
