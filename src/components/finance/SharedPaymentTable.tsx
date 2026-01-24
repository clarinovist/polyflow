'use client';

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatRupiah } from '@/lib/utils';
import { format } from 'date-fns';
import { CheckCircle2, CreditCard } from 'lucide-react';

interface Payment {
    id: string;
    referenceNumber: string;
    date: Date | string;
    entityName: string;
    amount: number;
    method: string;
    status: string;
}

interface ComponentProps {
    title: string;
    description: string;
    payments: Payment[];
    type: 'received' | 'sent';
}

export function SharedPaymentTable({ title, description, payments, type }: ComponentProps) {
    const isReceived = type === 'received';
    const amountColor = isReceived ? 'text-emerald-600' : 'text-red-600';
    const amountPrefix = isReceived ? '+' : '-';

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-muted-foreground" />
                    {title}
                </CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Reference</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>{isReceived ? 'Received From' : 'Paid To'}</TableHead>
                            <TableHead>Method</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="text-right">Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {payments.length > 0 ? (
                            payments.map((payment) => (
                                <TableRow key={payment.id} className="hover:bg-muted/50">
                                    <TableCell className="font-mono text-xs">{payment.referenceNumber}</TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {format(new Date(payment.date), 'dd MMM yyyy')}
                                    </TableCell>
                                    <TableCell className="font-medium">{payment.entityName}</TableCell>
                                    <TableCell>{payment.method}</TableCell>
                                    <TableCell className={`text-right font-bold ${amountColor}`}>
                                        {amountPrefix} {formatRupiah(payment.amount)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                                            <CheckCircle2 className="h-3 w-3 mr-1" />
                                            {payment.status}
                                        </Badge>
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                                    No payment records found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
