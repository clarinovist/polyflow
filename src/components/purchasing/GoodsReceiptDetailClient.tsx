'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatRupiah } from '@/lib/utils';
import { format } from 'date-fns';
import { ArrowLeft, Package, MapPin, Calendar, User, FileText } from 'lucide-react';
import Link from 'next/link';

interface GoodsReceiptItem {
    id: string;
    receivedQty: number;
    unitCost: number;
    productVariant: {
        id: string;
        name: string;
        skuCode: string;
        primaryUnit: string;
    };
}

interface GoodsReceiptDetailProps {
    receipt: {
        id: string;
        receiptNumber: string;
        receivedDate: Date | string;
        notes: string | null;
        purchaseOrder: {
            orderNumber: string;
            supplier: { name: string; code: string | null };
        };
        location: { name: string };
        createdBy: { name: string };
        items: GoodsReceiptItem[];
    };
    basePath?: string;
}

export function GoodsReceiptDetailClient({ receipt, basePath = '/dashboard/purchasing' }: GoodsReceiptDetailProps) {
    const totalValue = receipt.items.reduce(
        (sum, item) => sum + item.receivedQty * item.unitCost,
        0
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="sm" asChild>
                        <Link href={`${basePath}/receipts`}>
                            <ArrowLeft className="mr-2 h-4 w-4" /> Back
                        </Link>
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                            <Package className="h-6 w-6 text-emerald-600" />
                            {receipt.receiptNumber}
                        </h1>
                        <p className="text-muted-foreground text-sm">
                            Received on {format(new Date(receipt.receivedDate), 'PPP')}
                        </p>
                    </div>
                </div>

                <Button variant="outline" asChild>
                    <Link href={`${basePath}/orders/${receipt.purchaseOrder.orderNumber.replace('PO-', '')}`}>
                        <FileText className="mr-2 h-4 w-4" />
                        View PO {receipt.purchaseOrder.orderNumber}
                    </Link>
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>Received Items</CardTitle>
                            <CardDescription>Items received in this goods receipt</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="border rounded-lg overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-muted/50 border-b">
                                        <tr>
                                            <th className="h-10 px-4 text-left font-medium">Product</th>
                                            <th className="h-10 px-4 text-right font-medium">Quantity</th>
                                            <th className="h-10 px-4 text-right font-medium">Unit Cost</th>
                                            <th className="h-10 px-4 text-right font-medium">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {receipt.items.map((item) => (
                                            <tr key={item.id} className="hover:bg-muted/50 transition-colors">
                                                <td className="p-4">
                                                    <div className="font-medium">{item.productVariant.name}</div>
                                                    <div className="text-xs text-muted-foreground font-mono">
                                                        {item.productVariant.skuCode}
                                                    </div>
                                                </td>
                                                <td className="p-4 text-right tabular-nums">
                                                    {item.receivedQty} {item.productVariant.primaryUnit}
                                                </td>
                                                <td className="p-4 text-right tabular-nums">
                                                    {formatRupiah(item.unitCost)}
                                                </td>
                                                <td className="p-4 text-right font-medium tabular-nums">
                                                    {formatRupiah(item.receivedQty * item.unitCost)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-muted/50 border-t">
                                        <tr>
                                            <td colSpan={3} className="p-4 text-right font-bold">
                                                Total Value
                                            </td>
                                            <td className="p-4 text-right font-bold text-lg text-emerald-600 tabular-nums">
                                                {formatRupiah(totalValue)}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Receipt Details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-start gap-3">
                                <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                                <div>
                                    <h3 className="text-xs font-medium text-muted-foreground">Purchase Order</h3>
                                    <Link
                                        href={`${basePath}/orders`}
                                        className="font-mono text-blue-600 hover:underline"
                                    >
                                        {receipt.purchaseOrder.orderNumber}
                                    </Link>
                                </div>
                            </div>

                            <div className="flex items-start gap-3">
                                <Package className="h-4 w-4 text-muted-foreground mt-0.5" />
                                <div>
                                    <h3 className="text-xs font-medium text-muted-foreground">Supplier</h3>
                                    <p className="font-medium">{receipt.purchaseOrder.supplier.name}</p>
                                    {receipt.purchaseOrder.supplier.code && (
                                        <p className="text-xs text-muted-foreground font-mono">
                                            {receipt.purchaseOrder.supplier.code}
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-start gap-3">
                                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                                <div>
                                    <h3 className="text-xs font-medium text-muted-foreground">Received at</h3>
                                    <p className="font-medium">{receipt.location.name}</p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3">
                                <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
                                <div>
                                    <h3 className="text-xs font-medium text-muted-foreground">Received Date</h3>
                                    <p className="font-medium">
                                        {format(new Date(receipt.receivedDate), 'PPP')}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3">
                                <User className="h-4 w-4 text-muted-foreground mt-0.5" />
                                <div>
                                    <h3 className="text-xs font-medium text-muted-foreground">Received By</h3>
                                    <p className="font-medium">{receipt.createdBy.name}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {receipt.notes && (
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm">Notes</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                                    {receipt.notes}
                                </p>
                            </CardContent>
                        </Card>
                    )}

                    <Card className="bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800">
                        <CardContent className="p-4">
                            <div className="text-center">
                                <Badge className="bg-emerald-600 text-white mb-2">
                                    {receipt.items.length} Items
                                </Badge>
                                <p className="text-xs text-emerald-700 dark:text-emerald-300">
                                    Items have been added to inventory
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
