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
import { SalesOrder, SalesOrderStatus, Customer, Location, InvoiceStatus } from '@prisma/client';
import { FileText, ChevronRight } from 'lucide-react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { useRouter } from 'next/navigation';

// Helper types that match the structure of what's passed from server page
type SerializedSalesOrder = Omit<SalesOrder, 'totalAmount'> & {
    totalAmount: number | null;
    customer: (Omit<Customer, 'creditLimit' | 'discountPercent'> & {
        creditLimit: number | null;
        discountPercent: number | null;
    }) | null;
    sourceLocation: Location | null;
    items?: Array<{
        productVariant: {
            name: string;
            product: {
                name: string;
            };
        };
    }>;
    invoices?: Array<{
        id: string;
        invoiceNumber: string;
        status: InvoiceStatus;
        totalAmount: number;
        paidAmount: number;
        invoiceDate: string | Date;
        dueDate?: string | Date | null;
    }>;
    _count: { items: number };
};

interface SalesOrderTableProps {
    initialData: SerializedSalesOrder[];
    basePath?: string;
}

export function SalesOrderTable({ initialData, basePath = '/sales/orders' }: SalesOrderTableProps) {
    const router = useRouter();

    const getCustomerLabel = (order: SerializedSalesOrder) => order.customer?.name || 'Legacy Internal Stock Build';

    const isMaklonOrder = (order: SerializedSalesOrder) => order.orderType === 'MAKLON_JASA';

    const getOrderTypeLabel = (order: SerializedSalesOrder) => {
        switch (order.orderType) {
            case 'MAKE_TO_STOCK': return 'MTS';
            case 'MAKE_TO_ORDER': return 'MTO';
            case 'MAKLON_JASA': return 'Maklon Jasa';
            default: return 'Unknown';
        }
    };

    const getStatusLabel = (order: SerializedSalesOrder) => {
        if (!isMaklonOrder(order)) return order.status.replace(/_/g, ' ');

        switch (order.status) {
            case 'READY_TO_SHIP': return 'READY FOR SERVICE CLOSURE';
            case 'SHIPPED': return 'SERVICE CLOSED';
            case 'DELIVERED': return 'SERVICE DELIVERED';
            default: return order.status.replace(/_/g, ' ');
        }
    };

    const getLocationLabel = (order: SerializedSalesOrder) => {
        const locationName = order.sourceLocation?.name || '-';
        return isMaklonOrder(order) ? `Prod: ${locationName}` : locationName;
    };

    const getItemSummary = (order: SerializedSalesOrder) => {
        if (!order.items?.length) return `${order._count.items} item`;

        const productNames = order.items.slice(0, 2).map((item) => {
            const variant = item.productVariant;
            return variant.product.name === variant.name
                ? variant.name
                : `${variant.product.name} - ${variant.name}`;
        });

        const remainder = order.items.length - productNames.length;
        return remainder > 0
            ? `${productNames.join(', ')} +${remainder} lagi`
            : productNames.join(', ');
    };

    const getStatusColor = (status: SalesOrderStatus) => {
        switch (status) {
            case 'DRAFT': return 'bg-slate-100 text-slate-800 border-slate-200';
            case 'CONFIRMED': return 'bg-blue-100 text-blue-800 border-blue-200';
            case 'IN_PRODUCTION': return 'bg-amber-100 text-amber-800 border-amber-200';
            case 'READY_TO_SHIP': return 'bg-indigo-100 text-indigo-800 border-indigo-200';
            case 'SHIPPED': return 'bg-purple-100 text-purple-800 border-purple-200';
            case 'DELIVERED': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
            case 'CANCELLED': return 'bg-red-100 text-red-800 border-red-200';
            default: return 'bg-slate-100 text-slate-800';
        }
    };

    const getPaymentSummary = (order: SerializedSalesOrder) => {
        const invoices = order.invoices || [];
        if (invoices.length === 0) {
            return {
                label: 'Belum invoice',
                badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
                outstanding: 0,
            };
        }

        const outstanding = invoices.reduce((sum, invoice) => {
            const remaining = Number(invoice.totalAmount || 0) - Number(invoice.paidAmount || 0);
            return remaining > 0 ? sum + remaining : sum;
        }, 0);

        if (outstanding > 0) {
            return {
                label: 'Belum lunas',
                badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
                outstanding,
            };
        }

        return {
            label: 'Lunas',
            badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
            outstanding: 0,
        };
    };

    return (
        <div className="rounded-md border-none sm:border">
            {/* Desktop Table View */}
            <div className="hidden md:block">
                <ResponsiveTable minWidth={800}>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Order #</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Customer</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead className="hidden md:table-cell">Location</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Pembayaran</TableHead>
                                <TableHead className="text-right hidden sm:table-cell">Items</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                                <TableHead className="text-right">Outstanding</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {initialData.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={10} className="h-24 text-center">
                                        No sales orders found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                initialData.map((order) => {
                                    const paymentSummary = getPaymentSummary(order);

                                    return <TableRow
                                        key={order.id}
                                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        onClick={() => router.push(`${basePath}/${order.id}` as any)}
                                    >
                                        <TableCell className="font-medium">
                                            <div className="flex items-center gap-2">
                                                <FileText className="h-4 w-4 text-muted-foreground" />
                                                {order.orderNumber}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {format(new Date(order.orderDate), 'MMM d, yyyy')}
                                        </TableCell>
                                        <TableCell>
                                            <div>
                                                <div className="font-medium">{getCustomerLabel(order)}</div>
                                                {!order.customer && (
                                                    <div className="text-xs text-amber-700">Legacy internal order, not eligible for new invoicing</div>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="font-normal">
                                                {getOrderTypeLabel(order)}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="hidden md:table-cell">
                                            <Badge variant="outline" className="font-normal">
                                                {getLocationLabel(order)}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="secondary" className={getStatusColor(order.status)}>
                                                {getStatusLabel(order)}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="secondary" className={paymentSummary.badgeClass}>
                                                {paymentSummary.label}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="hidden sm:table-cell">
                                            <div className="text-sm">{getItemSummary(order)}</div>
                                            <div className="text-xs text-muted-foreground">{order._count.items} item(s)</div>
                                        </TableCell>
                                        <TableCell className="text-right font-medium">
                                            {order.totalAmount ? formatRupiah(Number(order.totalAmount)) : '-'}
                                        </TableCell>
                                        <TableCell className="text-right font-medium">
                                            {paymentSummary.outstanding > 0 ? formatRupiah(paymentSummary.outstanding) : '-'}
                                        </TableCell>
                                    </TableRow>;
                                })
                            )}
                        </TableBody>
                    </Table>
                </ResponsiveTable>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-3">
                {initialData.length === 0 ? (
                    <div className="text-center p-4 text-muted-foreground border rounded-lg border-dashed">
                        No sales orders found.
                    </div>
                ) : (
                    initialData.map((order) => {
                        const paymentSummary = getPaymentSummary(order);

                        return <Card
                            key={order.id}
                            className="overflow-hidden active:scale-[0.99] transition-transform cursor-pointer"
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            onClick={() => router.push(`${basePath}/${order.id}` as any)}
                        >
                            <CardHeader className="p-4 pb-2">
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-2">
                                        <div className="bg-primary/10 p-1.5 rounded-full">
                                            <FileText className="h-4 w-4 text-primary" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-sm">{order.orderNumber}</h3>
                                            <p className="text-xs text-muted-foreground">{format(new Date(order.orderDate), 'MMM d, yyyy')}</p>
                                        </div>
                                    </div>
                                    <Badge variant="secondary" className={`text-[10px] px-1.5 h-5 ${getStatusColor(order.status)}`}>
                                        {getStatusLabel(order)}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="p-4 pt-1">
                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                        <div>
                                            <p className="text-[10px] text-muted-foreground uppercase font-semibold">Customer</p>
                                            <p className="font-medium truncate">{getCustomerLabel(order)}</p>
                                            {!order.customer && (
                                                <p className="text-[10px] text-amber-700">Legacy internal order</p>
                                            )}
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[10px] text-muted-foreground uppercase font-semibold">Total</p>
                                            <p className="font-semibold text-primary">
                                                {order.totalAmount ? formatRupiah(Number(order.totalAmount)) : '-'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-xs">
                                        <span className="text-muted-foreground">Type</span>
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline" className="text-[10px]">
                                                {getOrderTypeLabel(order)}
                                            </Badge>
                                            <span className="text-muted-foreground">{getLocationLabel(order)}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-xs">
                                        <span className="text-muted-foreground">Pembayaran</span>
                                        <div className="flex items-center gap-2">
                                            <Badge variant="secondary" className={`text-[10px] ${paymentSummary.badgeClass}`}>
                                                {paymentSummary.label}
                                            </Badge>
                                            {paymentSummary.outstanding > 0 && (
                                                <span className="font-medium text-amber-700">{formatRupiah(paymentSummary.outstanding)}</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between pt-2 border-t text-xs text-muted-foreground text-[11px]">
                                        <div className="flex items-center gap-1">
                                            <span>• {getItemSummary(order)}</span>
                                        </div>
                                        <div className="flex items-center text-primary font-medium">
                                            View Details <ChevronRight className="h-3 w-3 ml-0.5" />
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>;
                    })
                )}
            </div>
        </div >
    );
}
