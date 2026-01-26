'use client';

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatRupiah } from '@/lib/utils';
import { format } from 'date-fns';
import { SalesQuotation, SalesQuotationStatus, Customer } from '@prisma/client';
import { FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';

// Helper types that match the structure of what's passed from server page
type SerializedSalesQuotation = Omit<SalesQuotation, 'totalAmount'> & {
    totalAmount: number | null;
    customer: Customer | null;
    _count: { items: number };
};

interface SalesQuotationTableProps {
    initialData: SerializedSalesQuotation[];
}

export function SalesQuotationTable({ initialData }: SalesQuotationTableProps) {
    const router = useRouter();

    const getStatusColor = (status: SalesQuotationStatus) => {
        switch (status) {
            case 'DRAFT': return 'bg-slate-100 text-slate-800 border-slate-200';
            case 'SENT': return 'bg-blue-100 text-blue-800 border-blue-200';
            case 'ACCEPTED': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
            case 'REJECTED': return 'bg-red-100 text-red-800 border-red-200';
            case 'EXPIRED': return 'bg-amber-100 text-amber-800 border-amber-200';
            case 'CONVERTED': return 'bg-purple-100 text-purple-800 border-purple-200';
            default: return 'bg-slate-100 text-slate-800';
        }
    };

    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Quotation #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Valid Until</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Items</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {initialData.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={7} className="h-24 text-center">
                                No quotations found.
                            </TableCell>
                        </TableRow>
                    ) : (
                        initialData.map((quotation) => (
                            <TableRow
                                key={quotation.id}
                                className="cursor-pointer hover:bg-muted/50 transition-colors"
                                onClick={() => router.push(`/sales/quotations/${quotation.id}`)}
                            >
                                <TableCell className="font-medium">
                                    <div className="flex items-center gap-2">
                                        <FileText className="h-4 w-4 text-muted-foreground" />
                                        {quotation.quotationNumber}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    {format(new Date(quotation.quotationDate), 'MMM d, yyyy')}
                                </TableCell>
                                <TableCell>
                                    {quotation.validUntil ? format(new Date(quotation.validUntil), 'MMM d, yyyy') : '-'}
                                </TableCell>
                                <TableCell>{quotation.customer?.name || 'Prospect'}</TableCell>
                                <TableCell>
                                    <Badge variant="secondary" className={getStatusColor(quotation.status)}>
                                        {quotation.status}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right text-muted-foreground">
                                    {quotation._count.items}
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                    {quotation.totalAmount ? formatRupiah(Number(quotation.totalAmount)) : '-'}
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </div>
    );
}
