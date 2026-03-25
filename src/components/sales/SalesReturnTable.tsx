'use client';

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/table';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Badge } from '@/components/ui/badge';
import { formatRupiah } from '@/lib/utils/utils';
import { format } from 'date-fns';
import { SalesReturn, SalesReturnStatus, Customer } from '@prisma/client';
import { RotateCcw, ChevronRight } from 'lucide-react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { useRouter } from 'next/navigation';

type SerializedSalesReturn = Omit<SalesReturn, 'totalAmount'> & {
    totalAmount: number | null;
    customer: (Omit<Customer, 'creditLimit' | 'discountPercent'> & {
        creditLimit: number | null;
        discountPercent: number | null;
    }) | null;
    salesOrder: { orderNumber: string } | null;
    _count: { items: number };
};

interface SalesReturnTableProps {
    initialData: SerializedSalesReturn[];
    basePath?: string;
}

export function SalesReturnTable({ initialData, basePath = '/sales/returns' }: SalesReturnTableProps) {
    const router = useRouter();

    const getStatusColor = (status: SalesReturnStatus) => {
        switch (status) {
            case 'DRAFT': return 'bg-slate-100 text-slate-800 border-slate-200';
            case 'CONFIRMED': return 'bg-amber-100 text-amber-800 border-amber-200';
            case 'RECEIVED': return 'bg-blue-100 text-blue-800 border-blue-200';
            case 'COMPLETED': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
            case 'CANCELLED': return 'bg-red-100 text-red-800 border-red-200';
            default: return 'bg-slate-100 text-slate-800';
        }
    };

    return (
        <div className="rounded-md border-none sm:border">
            {/* Desktop Table View */}
            <div className="hidden md:block">
                <ResponsiveTable minWidth={800}>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Return #</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Ref SO</TableHead>
                                <TableHead>Customer</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right hidden sm:table-cell">Items</TableHead>
                                <TableHead className="text-right">Total Amount</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {initialData.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-24 text-center">
                                        No sales returns found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                initialData.map((sr) => (
                                    <TableRow
                                        key={sr.id}
                                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                                        onClick={() => router.push(`${basePath}/${sr.id}`)}
                                    >
                                        <TableCell className="font-medium">
                                            <div className="flex items-center gap-2">
                                                <RotateCcw className="h-4 w-4 text-muted-foreground" />
                                                {sr.returnNumber}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {format(new Date(sr.returnDate), 'MMM d, yyyy')}
                                        </TableCell>
                                        <TableCell>
                                            {sr.salesOrder?.orderNumber || '-'}
                                        </TableCell>
                                        <TableCell>
                                            {sr.customer?.name || '-'}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="secondary" className={getStatusColor(sr.status)}>
                                                {sr.status.replace(/_/g, ' ')}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right text-muted-foreground hidden sm:table-cell">
                                            {sr._count.items}
                                        </TableCell>
                                        <TableCell className="text-right font-medium">
                                            {sr.totalAmount ? formatRupiah(Number(sr.totalAmount)) : '-'}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </ResponsiveTable>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-3">
                {initialData.length === 0 ? (
                    <div className="text-center p-4 text-muted-foreground border rounded-lg border-dashed">
                        No sales returns found.
                    </div>
                ) : (
                    initialData.map((sr) => (
                        <Card
                            key={sr.id}
                            className="overflow-hidden active:scale-[0.99] transition-transform cursor-pointer"
                            onClick={() => router.push(`${basePath}/${sr.id}`)}
                        >
                            <CardHeader className="p-4 pb-2">
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-2">
                                        <div className="bg-primary/10 p-1.5 rounded-full">
                                            <RotateCcw className="h-4 w-4 text-primary" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-sm">{sr.returnNumber}</h3>
                                            <p className="text-xs text-muted-foreground">{format(new Date(sr.returnDate), 'MMM d, yyyy')}</p>
                                        </div>
                                    </div>
                                    <Badge variant="secondary" className={`text-[10px] px-1.5 h-5 ${getStatusColor(sr.status)}`}>
                                        {sr.status.replace(/_/g, ' ')}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="p-4 pt-1">
                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                        <div>
                                            <p className="text-[10px] text-muted-foreground uppercase font-semibold">Customer</p>
                                            <p className="font-medium truncate">{sr.customer?.name || '-'}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[10px] text-muted-foreground uppercase font-semibold">Total Amount</p>
                                            <p className="font-semibold text-primary">
                                                {sr.totalAmount ? formatRupiah(Number(sr.totalAmount)) : '-'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between pt-2 border-t text-xs text-muted-foreground text-[11px]">
                                        <div className="flex items-center gap-1">
                                            <Badge variant="outline" className="h-4 px-1 rounded-sm text-[9px] font-normal">
                                                SO: {sr.salesOrder?.orderNumber || '-'}
                                            </Badge>
                                            <span>• {sr._count.items} Items</span>
                                        </div>
                                        <div className="flex items-center text-primary font-medium">
                                            View Details <ChevronRight className="h-3 w-3 ml-0.5" />
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
}
