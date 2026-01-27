'use client';

import {
    SalesOrder,
    SalesOrderItem,
    SalesOrderStatus,
    Customer,
    Location,
    ProductVariant,
    Product,
    Invoice,
    ProductionOrder,
    StockMovement
} from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatRupiah } from '@/lib/utils';
import { format } from 'date-fns';
import { ArrowLeft, Edit, Truck, CheckCircle, XCircle, Package, Receipt } from 'lucide-react';
import Link from 'next/link';
import {
    confirmSalesOrder,
    shipSalesOrder,
    deliverSalesOrder,
    cancelSalesOrder,
    deleteSalesOrder,
    markReadyToShip
} from '@/actions/sales';
import { createInvoice } from '@/actions/invoice';
import { useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { ProductionStatusCard } from './ProductionStatusCard';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";


// Helper types for client-side usage where Decimals are converted to numbers and Dates to strings
type SerializedSalesOrderItem = Omit<SalesOrderItem, 'quantity' | 'unitPrice' | 'subtotal' | 'deliveredQty' | 'createdAt' | 'updatedAt'> & {
    quantity: number;
    unitPrice: number;
    subtotal: number;
    deliveredQty: number;
    createdAt: Date | string;
    updatedAt: Date | string;
    productVariant: Omit<ProductVariant, 'price' | 'buyPrice' | 'sellPrice' | 'conversionFactor' | 'minStockAlert' | 'reorderPoint' | 'reorderQuantity' | 'costingMethod' | 'standardCost' | 'createdAt' | 'updatedAt'> & {
        createdAt: Date | string;
        updatedAt: Date | string;
        product: Product;
    };
};

type SerializedStockMovement = Omit<StockMovement, 'quantity' | 'cost' | 'createdAt'> & {
    quantity: number;
    cost: number | null;
    createdAt: Date | string;
};

type SerializedProductionOrder = Omit<ProductionOrder, 'plannedQuantity' | 'actualQuantity' | 'plannedStartDate' | 'plannedEndDate' | 'actualStartDate' | 'actualEndDate' | 'createdAt' | 'updatedAt'> & {
    plannedQuantity: number;
    actualQuantity: number | null;
    plannedStartDate: Date | string;
    plannedEndDate: Date | string | null;
    actualStartDate: Date | string | null;
    actualEndDate: Date | string | null;
    createdAt: Date | string;
    updatedAt: Date | string;
};

type SerializedSalesOrder = Omit<SalesOrder, 'totalAmount' | 'orderDate' | 'expectedDate' | 'createdAt' | 'updatedAt'> & {
    totalAmount: number | null;
    orderDate: Date | string;
    expectedDate: Date | string | null;
    createdAt: Date | string;
    updatedAt: Date | string;
    items: SerializedSalesOrderItem[];
    customer: (Omit<Customer, 'creditLimit' | 'discountPercent' | 'createdAt' | 'updatedAt'> & {
        creditLimit: number | null;
        discountPercent: number | null;
        createdAt: Date | string;
        updatedAt: Date | string;
    }) | null;
    sourceLocation: Location | null;
    invoices: (Omit<Invoice, 'totalAmount' | 'paidAmount' | 'invoiceDate' | 'dueDate' | 'createdAt' | 'updatedAt'> & {
        totalAmount: number;
        paidAmount: number;
        invoiceDate: Date | string;
        dueDate: Date | string | null;
        createdAt: Date | string;
        updatedAt: Date | string;
    })[];
    productionOrders: SerializedProductionOrder[];
    movements: SerializedStockMovement[];
    createdBy: { name: string } | null;
};

interface SalesOrderDetailClientProps {
    order: SerializedSalesOrder;
    basePath?: string;
    warehouseMode?: boolean;
    currentUserRole?: string;
}
export function SalesOrderDetailClient({
    order,
    basePath = '/sales',
    warehouseMode = false
}: SalesOrderDetailClientProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);


    // MRP Simulation State


    const handleAction = async (action: string, handler: (id: string) => Promise<{ success: boolean; error?: string }>) => {
        setIsLoading(true);
        try {
            const result = await handler(order.id);
            if (result.success) {
                toast.success(`Order ${action} successfully`);
                router.refresh();
            } else {
                toast.error(result.error || `Failed to ${action} order`);
            }
        } catch {
            toast.error("An error occurred");
        } finally {
            setIsLoading(false);
        }
    };



    const handleGenerateInvoice = async () => {
        if (order.status !== 'SHIPPED' && order.status !== 'DELIVERED') {
            toast.error("Order must be shipped or delivered to generate invoice");
            return;
        }

        setIsLoading(true);
        try {
            const result = await createInvoice({
                salesOrderId: order.id,
                invoiceDate: new Date(),
                termOfPaymentDays: 30, // Default
                notes: `Invoice for Order ${order.orderNumber}`
            });

            if (result.success) {
                toast.success("Invoice generated successfully");
                router.refresh();
            } else {
                toast.error(result.error || "Failed to generate invoice");
            }
        } catch (_error) {
            toast.error("An error occurred");
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async () => {
        setIsLoading(true);
        try {
            const result = await deleteSalesOrder(order.id);
            if (result.success) {
                toast.success("Order deleted");
                router.push(basePath);
            } else {
                toast.error(result.error);
            }
        } catch (_error) {
            toast.error("Failed to delete order");
        } finally {
            setIsLoading(false);
        }
    };

    const getStatusBadge = (status: SalesOrderStatus) => {
        const styles: Record<string, string> = {
            DRAFT: 'bg-slate-100 text-slate-800',
            CONFIRMED: 'bg-blue-100 text-blue-800',
            IN_PRODUCTION: 'bg-amber-100 text-amber-800',
            READY_TO_SHIP: 'bg-indigo-100 text-indigo-800',
            SHIPPED: 'bg-purple-100 text-purple-800',
            DELIVERED: 'bg-emerald-100 text-emerald-800',
            CANCELLED: 'bg-red-100 text-red-800',
        };
        return (
            <Badge variant="secondary" className={styles[status] || styles.DRAFT}>
                {status.replace(/_/g, ' ')}
            </Badge>
        );
    };

    return (
        <div className="space-y-6">
            {/* Header Actions */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="sm" asChild>
                        <Link href={basePath}>
                            <ArrowLeft className="mr-2 h-4 w-4" /> Back
                        </Link>
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                            Order {order.orderNumber}
                            {getStatusBadge(order.status)}
                        </h1>
                        <p className="text-muted-foreground text-sm">
                            Created on {format(new Date(order.orderDate), 'PPP')}
                        </p>
                    </div>
                </div>

                <div className="flex gap-2">
                    {/* Button Place */}

                    {!warehouseMode && order.status === 'DRAFT' && (
                        <>
                            <Button variant="outline" asChild>
                                <Link href={`${basePath}/${order.id}/edit`}>
                                    <Edit className="mr-2 h-4 w-4" /> Edit
                                </Link>
                            </Button>

                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="destructive" disabled={isLoading}>Delete</Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            This action cannot be undone. This will permanently delete the draft order.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                                            Delete
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>

                            <Button
                                onClick={() => handleAction('confirmed', confirmSalesOrder)}
                                disabled={isLoading}
                                className="bg-blue-600 hover:bg-blue-700 text-white"
                            >
                                <CheckCircle className="mr-2 h-4 w-4" /> Confirm Order
                            </Button>
                        </>
                    )}

                    {order.status === 'IN_PRODUCTION' && (
                        <Button
                            onClick={() => handleAction('ready to ship', markReadyToShip)}
                            disabled={isLoading}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                            <Package className="mr-2 h-4 w-4" /> Production Complete
                        </Button>
                    )}

                    {(order.status === 'CONFIRMED' || order.status === 'READY_TO_SHIP') && (
                        <Button
                            onClick={() => handleAction('shipped', shipSalesOrder)}
                            disabled={isLoading}
                            className="bg-purple-600 hover:bg-purple-700 text-white"
                        >
                            <Truck className="mr-2 h-4 w-4" /> Ship Order
                        </Button>
                    )}

                    {(order.status === 'SHIPPED' || order.status === 'DELIVERED') && (
                        <>
                            {order.status === 'SHIPPED' && (
                                <Button
                                    onClick={() => handleAction('delivered', deliverSalesOrder)}
                                    disabled={isLoading}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                >
                                    <Package className="mr-2 h-4 w-4" /> Mark Delivered
                                </Button>
                            )}

                            {!warehouseMode && order.invoices.length === 0 && (
                                <Button
                                    onClick={handleGenerateInvoice}
                                    disabled={isLoading}
                                    className="bg-sky-600 hover:bg-sky-700 text-white"
                                >
                                    <Receipt className="mr-2 h-4 w-4" /> Generate Invoice
                                </Button>
                            )}
                        </>
                    )}

                    {!warehouseMode && ['DRAFT', 'CONFIRMED', 'IN_PRODUCTION', 'READY_TO_SHIP'].includes(order.status) && (
                        <Button
                            variant="ghost"
                            className="text-red-500 hover:text-red-600 hover:bg-red-50"
                            onClick={() => handleAction('cancelled', cancelSalesOrder)}
                            disabled={isLoading}
                        >
                            <XCircle className="mr-2 h-4 w-4" /> Cancel
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Main Order Info */}
                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle>Order Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <h3 className="font-semibold text-sm text-muted-foreground">Customer</h3>
                                <p className="text-lg">{order.customer?.name || 'Internal / MTS'}</p>
                                <p className="text-sm text-muted-foreground">{order.customer?.email || (order.orderType === 'MAKE_TO_STOCK' ? 'Internal Inventory' : 'No email')}</p>
                                <p className="text-sm text-muted-foreground">{order.customer?.phone || ''}</p>
                            </div>
                            <div>
                                <h3 className="font-semibold text-sm text-muted-foreground">Source Warehouse</h3>
                                <p className="text-lg">{order.sourceLocation?.name || 'N/A'}</p>
                            </div>
                            <div>
                                <h3 className="font-semibold text-sm text-muted-foreground">Expected Delivery</h3>
                                <p>{order.expectedDate ? format(new Date(order.expectedDate), 'PPP') : '-'}</p>
                            </div>
                            <div>
                                <h3 className="font-semibold text-sm text-muted-foreground">Order Type</h3>
                                <Badge variant="outline">{order.orderType.replace(/_/g, ' ')}</Badge>
                            </div>
                        </div>

                        {order.notes && (
                            <div className="bg-muted/50 p-4 rounded-md">
                                <h3 className="font-semibold text-sm mb-1">Notes</h3>
                                <p className="text-sm whitespace-pre-wrap">{order.notes}</p>
                            </div>
                        )}

                        <div className="border rounded-lg overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50 border-b">
                                    <tr>
                                        <th className="h-10 px-4 text-left font-medium">Product</th>
                                        <th className="h-10 px-4 text-right font-medium">Quantity</th>
                                        <th className="h-10 px-4 text-right font-medium">Delivered</th>
                                        {!warehouseMode && <th className="h-10 px-4 text-right font-medium">Unit Price</th>}
                                        {!warehouseMode && <th className="h-10 px-4 text-right font-medium">Subtotal</th>}
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {order.items.map((item) => (
                                        <tr key={item.id} className="hover:bg-muted/50">
                                            <td className="p-4">
                                                <div className="font-medium">{item.productVariant.product.name}</div>
                                                <div className="text-xs text-muted-foreground">
                                                    {item.productVariant.name} - {item.productVariant.skuCode}
                                                </div>
                                            </td>
                                            <td className="p-4 text-right">{Number(item.quantity)}</td>
                                            <td className="p-4 text-right">
                                                <span className={Number(item.deliveredQty) > 0 ? "text-emerald-600 font-medium" : "text-muted-foreground"}>
                                                    {Number(item.deliveredQty)}
                                                </span>
                                            </td>
                                            {!warehouseMode && <td className="p-4 text-right">{formatRupiah(Number(item.unitPrice))}</td>}
                                            {!warehouseMode && <td className="p-4 text-right font-medium">{formatRupiah(Number(item.subtotal))}</td>}
                                        </tr>
                                    ))}
                                </tbody>
                                {!warehouseMode && (
                                    <tfoot className="bg-muted/50 border-t">
                                        <tr>
                                            <td colSpan={4} className="p-4 text-right font-bold">Total Amount</td>
                                            <td className="p-4 text-right font-bold text-lg">
                                                {formatRupiah(Number(order.totalAmount))}
                                            </td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    </CardContent>
                </Card>

                {/* Sidebar Info (Invoices / Movements / Production) */}
                <div className="space-y-6">
                    {/* INVOICES CARD */}
                    {!warehouseMode && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Invoices</CardTitle>
                                <CardDescription>Generated invoices for this order</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {order.invoices && order.invoices.length > 0 ? (
                                    <ul className="space-y-4">
                                        {order.invoices.map((inv) => (
                                            <li key={inv.id} className="border p-3 rounded-md">
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="font-medium">{inv.invoiceNumber}</span>
                                                    <Badge variant={inv.status === 'PAID' ? 'default' : 'destructive'}>
                                                        {inv.status}
                                                    </Badge>
                                                </div>
                                                <div className="text-sm text-muted-foreground mb-1">
                                                    {format(new Date(inv.invoiceDate), 'PP')}
                                                </div>
                                                <div className="font-semibold">
                                                    {formatRupiah(Number(inv.totalAmount))}
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-sm text-muted-foreground">No invoices generated.</p>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    <ProductionStatusCard
                        salesOrderId={order.id}
                        status={order.status}
                        productionOrders={order.productionOrders}
                        items={order.items}
                    />

                    <Card>
                        <CardHeader>
                            <CardTitle>Shipment History</CardTitle>
                            <CardDescription>Stock movements related to this order</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {order.movements.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No shipments yet.</p>
                            ) : (
                                <ul className="space-y-4">
                                    {order.movements.map((m) => (
                                        <li key={m.id} className="text-sm border-l-2 border-purple-200 pl-4 py-1">
                                            <div className="font-medium">Shipped {Number(m.quantity)} units</div>
                                            <div className="text-xs text-muted-foreground">
                                                {format(new Date(m.createdAt), 'PP p')}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
            {/* MRP Simulation Dialog */}

        </div>


    );
}
