'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { FileQuestion } from 'lucide-react';
import { listCustomerQuotations } from '@/actions/sales/customer-360';
import { ORDER_PHASE_LABELS } from '@/lib/sales/order-phase';
import Link from 'next/link';

/**
 * Penawaran = SalesOrder fase quotation, jadi baris di sini adalah SalesOrder.
 */
type Row = {
    id: string;
    orderNumber: string;
    orderDate: string | Date;
    validUntil?: string | Date | null;
    totalAmount?: { toNumber(): number } | number | null;
    status: string;
};

function fmtDate(d: string | Date | null | undefined) {
    if (!d) return '-';
    return new Intl.DateTimeFormat('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    }).format(new Date(d));
}
function toN(v: unknown) {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'object' && 'toNumber' in (v as object))
        return (v as { toNumber(): number }).toNumber();
    return Number(v);
}
function fmtIdr(n: number) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
    }).format(n);
}

export function CustomerQuotationsTab({ customerId }: { customerId: string }) {
    const [rows, setRows] = useState<Row[]>([]);
    const [loading, setLoading] = useState(true);
    const load = useCallback(async () => {
        setLoading(true);
        const res = await listCustomerQuotations(customerId);
        setRows(res.success ? ((res.data as unknown as Row[]) ?? []) : []);
        setLoading(false);
    }, [customerId]);
    useEffect(() => {
        load();
    }, [load]);
    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                    <FileQuestion className="h-5 w-5 text-primary" />
                    <div>
                        <CardTitle className="text-base">Penawaran</CardTitle>
                        <p className="text-xs text-muted-foreground">
                            {rows.length} penawaran
                        </p>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <p className="text-xs text-center py-8 text-muted-foreground">
                        Memuat…
                    </p>
                ) : rows.length === 0 ? (
                    <p className="text-xs text-center py-8 text-muted-foreground">
                        Belum ada penawaran.
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-muted/30">
                                <TableRow>
                                    <TableHead>No. Penawaran</TableHead>
                                    <TableHead>Tanggal</TableHead>
                                    <TableHead>Berlaku Sampai</TableHead>
                                    <TableHead className="text-right">
                                        Total
                                    </TableHead>
                                    <TableHead>Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.map((r) => (
                                    <TableRow key={r.id}>
                                        <TableCell className="font-mono text-sm">
                                            <Link
                                                href={`/sales/orders/${r.id}`}
                                                className="hover:underline text-primary"
                                            >
                                                {r.orderNumber}
                                            </Link>
                                        </TableCell>
                                        <TableCell className="text-sm">
                                            {fmtDate(r.orderDate)}
                                        </TableCell>
                                        <TableCell className="text-sm">
                                            {fmtDate(r.validUntil)}
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-sm">
                                            {r.totalAmount
                                                ? fmtIdr(toN(r.totalAmount))
                                                : '-'}
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant="outline"
                                                className="text-[10px]"
                                            >
                                                {ORDER_PHASE_LABELS[r.status] ??
                                                    r.status}
                                            </Badge>
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
