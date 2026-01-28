'use client';

import React, { useState } from 'react';
import {
    PurchaseOrder,
    PurchaseOrderItem,
    PurchaseOrderStatus,
    Supplier,
    GoodsReceipt,
    PurchaseInvoice
} from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatRupiah } from '@/lib/utils';
import { format } from 'date-fns';
import { ArrowLeft, Download, CheckCircle, Receipt, Info, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
    updatePurchaseOrderStatus,
    createPurchaseInvoice,
    deletePurchaseOrder
} from '@/actions/purchasing';

// Serialized types
type SerializedPOItem = Omit<PurchaseOrderItem, 'quantity' | 'unitPrice' | 'subtotal' | 'receivedQty'> & {
    quantity: number;
    unitPrice: number;
    subtotal: number;
    receivedQty: number;
    productVariant: {
        id: string;
        name: string;
        skuCode: string;
        primaryUnit: string;
    };
};

type SerializedPO = Omit<PurchaseOrder, 'totalAmount' | 'orderDate' | 'expectedDate' | 'createdAt' | 'updatedAt'> & {
    totalAmount: number | null;
    orderDate: Date | string;
    expectedDate: Date | string | null;
    createdAt: Date | string;
    updatedAt: Date | string;
    items: SerializedPOItem[];
    supplier: Supplier;
    goodsReceipts: (GoodsReceipt & { createdBy: { name: string }, location: { name: string } })[];
    invoices: PurchaseInvoice[];
    createdBy: { name: string } | null;
};

interface PurchaseOrderDetailClientProps {
    order: SerializedPO;
    basePath?: string;
    warehouseMode?: boolean;
}

export function PurchaseOrderDetailClient({
    order,
    basePath = '/planning/purchase-orders',
    warehouseMode = false
}: PurchaseOrderDetailClientProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);

    const getStatusBadge = (status: PurchaseOrderStatus) => {
        const styles: Record<string, string> = {
            DRAFT: 'bg-slate-100 text-slate-800',
            SENT: 'bg-blue-100 text-blue-800',
            PARTIAL_RECEIVED: 'bg-amber-100 text-amber-800',
            RECEIVED: 'bg-emerald-100 text-emerald-800',
            CANCELLED: 'bg-red-100 text-red-800',
        };
        return (
            <Badge variant="secondary" className={styles[status] || styles.DRAFT}>
                {status.replace(/_/g, ' ')}
            </Badge>
        );
    };

    const handleConfirm = async () => {
        setIsLoading(true);
        try {
            const result = await updatePurchaseOrderStatus(
                order.id,
                PurchaseOrderStatus.SENT
            );
            if (result) {
                toast.success("Order marked as Sent");
                router.refresh();
            }
        } catch (_error) {
            toast.error("Failed to update order");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="sm" asChild>
                        <Link href={basePath}>
                            <ArrowLeft className="mr-2 h-4 w-4" /> Back
                        </Link>
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                            PO {order.orderNumber}
                            {getStatusBadge(order.status)}
                        </h1>
                        <p className="text-muted-foreground text-sm">
                            Created on {format(new Date(order.orderDate), 'PPP')} by {order.createdBy?.name || 'Unknown'}
                        </p>
                    </div>
                </div>

                <div className="flex gap-2">
                    {!warehouseMode && order.status === 'DRAFT' && (
                        <Button
                            onClick={handleConfirm}
                            disabled={isLoading}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            <CheckCircle className="mr-2 h-4 w-4" /> Mark as Sent
                        </Button>
                    )}

                    {(order.status === 'SENT' || order.status === 'PARTIAL_RECEIVED') && (
                        <Link href={`/warehouse/incoming/create-receipt?poId=${order.id}`}>
                            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
                                <Download className="mr-2 h-4 w-4" /> Receive Goods
                            </Button>
                        </Link>
                    )}

                    {!warehouseMode && order.invoices.length === 0 && order.status !== 'CANCELLED' && order.status !== 'DRAFT' && (
                        <Button
                            variant="outline"
                            onClick={async () => {
                                setIsLoading(true);
                                try {
                                    const result = await createPurchaseInvoice({
                                        purchaseOrderId: order.id,
                                        invoiceNumber: `INV-${order.orderNumber}`,
                                        invoiceDate: new Date(),
                                        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days default
                                        termOfPaymentDays: 30,
                                    });
                                    if (result) {
                                        toast.success("Invoice generated");
                                        router.refresh();
                                    }
                                } catch (_error) {
                                    toast.error("Failed to generate invoice");
                                } finally {
                                    setIsLoading(false);
                                }
                            }}
                            disabled={isLoading}
                        >
                            <Receipt className="mr-2 h-4 w-4" /> Create Invoice
                        </Button>
                    )}

                    {!warehouseMode && (order.status === 'DRAFT' || order.status === 'CANCELLED') && (
                        <Button
                            variant="outline"
                            className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                            onClick={async () => {
                                if (!confirm(`Are you sure you want to delete ${order.orderNumber}? This cannot be undone.`)) {
                                    return;
                                }
                                setIsLoading(true);
                                try {
                                    const result = await deletePurchaseOrder(order.id);
                                    if (result.success) {
                                        toast.success(`${order.orderNumber} deleted`);
                                        router.push(basePath);
                                    } else {
                                        toast.error(result.error || 'Failed to delete order');
                                    }
                                } catch (_error) {
                                    toast.error('Failed to delete order');
                                } finally {
                                    setIsLoading(false);
                                }
                            }}
                            disabled={isLoading}
                        >
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Order Items</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="border rounded-lg overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-muted/50 border-b">
                                        <tr>
                                            <th className="h-10 px-4 text-left font-medium">Product</th>
                                            <th className="h-10 px-4 text-right font-medium">Ordered</th>
                                            <th className="h-10 px-4 text-right font-medium">Received</th>
                                            <th className="h-10 px-4 text-right font-medium">Unit Cost</th>
                                            <th className="h-10 px-4 text-right font-medium">Subtotal</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {order.items.map((item) => (
                                            <tr key={item.id} className="hover:bg-muted/50 transition-colors">
                                                <td className="p-4">
                                                    <div className="font-medium">{item.productVariant.name}</div>
                                                    <div className="text-xs text-muted-foreground">{item.productVariant.skuCode}</div>
                                                </td>
                                                <td className="p-4 text-right">
                                                    {item.quantity} {item.productVariant.primaryUnit}
                                                </td>
                                                <td className="p-4 text-right">
                                                    <span className={item.receivedQty >= item.quantity ? "text-emerald-600 font-bold" : "text-amber-600"}>
                                                        {item.receivedQty}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-right">{formatRupiah(item.unitPrice)}</td>
                                                <td className="p-4 text-right font-medium">{formatRupiah(item.subtotal)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-muted/50 border-t">
                                        <tr>
                                            <td colSpan={4} className="p-4 text-right font-bold underline decoration-blue-500/30 decoration-2">Total Amount</td>
                                            <td className="p-4 text-right font-bold text-lg text-blue-600">
                                                {formatRupiah(order.totalAmount || 0)}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </CardContent>
                    </Card>

                    {order.notes && (
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm flex items-center gap-2">
                                    <Info className="h-4 w-4 text-blue-500" />
                                    Internal Notes
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm whitespace-pre-wrap text-muted-foreground">{order.notes}</p>
                            </CardContent>
                        </Card>
                    )}
                </div>

                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Supplier Information</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <h3 className="text-sm font-semibold text-muted-foreground">Name</h3>
                                <p className="font-medium text-lg">{order.supplier.name}</p>
                            </div>
                            {order.supplier.code && (
                                <div>
                                    <h3 className="text-sm font-semibold text-muted-foreground">Supplier Code</h3>
                                    <p className="font-mono">{order.supplier.code}</p>
                                </div>
                            )}
                            <div>
                                <h3 className="text-sm font-semibold text-muted-foreground">Expected Date</h3>
                                <p>{order.expectedDate ? format(new Date(order.expectedDate), 'PPP') : 'Not specified'}</p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Goods Receipts</CardTitle>
                            <CardDescription>Items received against this PO</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {order.goodsReceipts.length === 0 ? (
                                <p className="text-sm text-muted-foreground italic">No receipts recorded.</p>
                            ) : (
                                <ul className="space-y-4">
                                    {order.goodsReceipts.map((gr) => (
                                        <li key={gr.id} className="border-l-4 border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 p-3 rounded-r-md">
                                            <div className="flex justify-between items-center mb-1">
                                                <Link
                                                    href={`/warehouse/incoming/${gr.id}`}
                                                    className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400 hover:underline"
                                                >
                                                    {gr.receiptNumber}
                                                </Link>
                                                <span className="text-[10px] text-muted-foreground">{format(new Date(gr.receivedDate), 'dd/MM/yy')}</span>
                                            </div>
                                            <div className="text-xs font-medium">Loc: {gr.location.name}</div>
                                            <div className="text-[10px] text-muted-foreground italic mt-1">Recv by: {gr.createdBy.name}</div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Invoices</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {order.invoices.length === 0 ? (
                                <p className="text-sm text-muted-foreground italic">No invoices created.</p>
                            ) : (
                                <ul className="space-y-4">
                                    {order.invoices.map((inv) => (
                                        <li key={inv.id} className="border p-3 rounded-md shadow-sm">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="font-bold text-xs">{inv.invoiceNumber}</span>
                                                <Badge className={inv.status === 'PAID' ? 'bg-emerald-500' : 'bg-amber-500'}>
                                                    {inv.status}
                                                </Badge>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="font-semibold">{formatRupiah(Number(inv.totalAmount))}</span>
                                                <span className="text-xs text-muted-foreground">Due: {inv.dueDate ? format(new Date(inv.dueDate), 'dd MMM') : '-'}</span>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
