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
import { PurchaseReturn, PurchaseReturnStatus, Supplier } from '@prisma/client';
import { RotateCcw, ChevronRight } from 'lucide-react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { useRouter } from 'next/navigation';

type SerializedPurchaseReturn = Omit<PurchaseReturn, 'totalAmount'> & {
    totalAmount: number | null;
    supplier: Supplier | null;
    purchaseOrder: { orderNumber: string } | null;
    _count: { items: number };
};

interface PurchaseReturnTableProps {
    initialData: SerializedPurchaseReturn[];
    basePath?: string;
}

export function PurchaseReturnTable({ initialData, basePath = '/planning/purchase-returns' }: PurchaseReturnTableProps) {
    const router = useRouter();

    const getStatusColor = (status: PurchaseReturnStatus) => {
        switch (status) {
            case 'DRAFT': return 'bg-slate-100 text-slate-800 border-slate-200';
            case 'CONFIRMED': return 'bg-amber-100 text-amber-800 border-amber-200';
            case 'SHIPPED': return 'bg-blue-100 text-blue-800 border-blue-200';
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
                                <TableHead>Ref PO</TableHead>
                                <TableHead>Supplier</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right hidden sm:table-cell">Items</TableHead>
                                <TableHead className="text-right">Total Amount</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {initialData.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-24 text-center">
                                        No purchase returns found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                initialData.map((pr) => (
                                    <TableRow
                                        key={pr.id}
                                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                                        onClick={() => router.push(`${basePath}/${pr.id}`)}
                                    >
                                        <TableCell className="font-medium">
                                            <div className="flex items-center gap-2">
                                                <RotateCcw className="h-4 w-4 text-muted-foreground" />
                                                {pr.returnNumber}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {format(new Date(pr.returnDate), 'MMM d, yyyy')}
                                        </TableCell>
                                        <TableCell>
                                            {pr.purchaseOrder?.orderNumber || '-'}
                                        </TableCell>
                                        <TableCell>
                                            {pr.supplier?.name || '-'}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="secondary" className={getStatusColor(pr.status)}>
                                                {pr.status.replace(/_/g, ' ')}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right text-muted-foreground hidden sm:table-cell">
                                            {pr._count.items}
                                        </TableCell>
                                        <TableCell className="text-right font-medium">
                                            {pr.totalAmount ? formatRupiah(Number(pr.totalAmount)) : '-'}
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
                        No purchase returns found.
                    </div>
                ) : (
                    initialData.map((pr) => (
                        <Card
                            key={pr.id}
                            className="overflow-hidden active:scale-[0.99] transition-transform cursor-pointer"
                            onClick={() => router.push(`${basePath}/${pr.id}`)}
                        >
                            <CardHeader className="p-4 pb-2">
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-2">
                                        <div className="bg-primary/10 p-1.5 rounded-full">
                                            <RotateCcw className="h-4 w-4 text-primary" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-sm">{pr.returnNumber}</h3>
                                            <p className="text-xs text-muted-foreground">{format(new Date(pr.returnDate), 'MMM d, yyyy')}</p>
                                        </div>
                                    </div>
                                    <Badge variant="secondary" className={`text-[10px] px-1.5 h-5 ${getStatusColor(pr.status)}`}>
                                        {pr.status.replace(/_/g, ' ')}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="p-4 pt-1">
                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                        <div>
                                            <p className="text-[10px] text-muted-foreground uppercase font-semibold">Supplier</p>
                                            <p className="font-medium truncate">{pr.supplier?.name || '-'}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[10px] text-muted-foreground uppercase font-semibold">Total Amount</p>
                                            <p className="font-semibold text-primary">
                                                {pr.totalAmount ? formatRupiah(Number(pr.totalAmount)) : '-'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between pt-2 border-t text-xs text-muted-foreground text-[11px]">
                                        <div className="flex items-center gap-1">
                                            <Badge variant="outline" className="h-4 px-1 rounded-sm text-[9px] font-normal">
                                                PO: {pr.purchaseOrder?.orderNumber || '-'}
                                            </Badge>
                                            <span>• {pr._count.items} Items</span>
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
