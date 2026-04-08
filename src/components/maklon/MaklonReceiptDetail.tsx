import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
    User, MapPin, Calendar, PackageSearch, ClipboardList, Hash, Box
} from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

type ReceiptItem = {
    id: string;
    receivedQty: string | number;
    productVariant: {
        name: string;
        skuCode: string;
        primaryUnit: string;
        product: { name: string };
    };
};

type MaklonReceiptData = {
    id: string;
    receiptNumber: string;
    receivedDate: string;
    notes: string | null;
    isMaklon: boolean;
    customer: { id: string; name: string } | null;
    location: { id: string; name: string };
    createdBy: { id: string; name: string } | null;
    items: ReceiptItem[];
};

interface MaklonReceiptDetailProps {
    receipt: MaklonReceiptData;
}

export function MaklonReceiptDetail({ receipt }: MaklonReceiptDetailProps) {
    const totalItems = receipt.items.length;

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            {/* Back Link */}
            <Link
                href="/dashboard/maklon/receipts"
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors w-fit"
            >
                <ArrowLeft className="h-4 w-4" />
                <span className="text-sm font-medium">Back to Maklon Receipts</span>
            </Link>

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <h1 className="text-2xl font-bold tracking-tight">{receipt.receiptNumber}</h1>
                        <Badge className="bg-purple-100 text-purple-700 border-purple-200 border hover:bg-purple-100">
                            <PackageSearch className="w-3 h-3 mr-1" />
                            Maklon Receipt
                        </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Customer Material Intake — goods received on behalf of customer for Maklon Jasa processing
                    </p>
                </div>
                <Button variant="outline" size="sm" className="gap-2 text-purple-700 border-purple-200 hover:bg-purple-50" asChild>
                    <Link href="/warehouse/incoming/create-maklon">
                        <PackageSearch className="w-4 h-4" />
                        New Receipt
                    </Link>
                </Button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="border-purple-100">
                    <CardContent className="pt-5">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-purple-100 rounded-lg">
                                <User className="w-4 h-4 text-purple-700" />
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Customer</p>
                                <p className="font-semibold text-sm mt-0.5">{receipt.customer?.name ?? '—'}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-purple-100">
                    <CardContent className="pt-5">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-purple-100 rounded-lg">
                                <MapPin className="w-4 h-4 text-purple-700" />
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Storage Location</p>
                                <p className="font-semibold text-sm mt-0.5">{receipt.location.name}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-purple-100">
                    <CardContent className="pt-5">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-purple-100 rounded-lg">
                                <Calendar className="w-4 h-4 text-purple-700" />
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Received Date</p>
                                <p className="font-semibold text-sm mt-0.5">
                                    {format(new Date(receipt.receivedDate), 'dd MMM yyyy')}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Items Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <ClipboardList className="w-4 h-4" />
                        Received Items
                        <Badge variant="secondary" className="ml-auto">
                            {totalItems} {totalItems === 1 ? 'item' : 'items'}
                        </Badge>
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-muted/40 border-b">
                                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                                        <span className="flex items-center gap-1"><Box className="w-3 h-3" /> Material</span>
                                    </th>
                                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                                        <span className="flex items-center gap-1"><Hash className="w-3 h-3" /> SKU</span>
                                    </th>
                                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                                        Qty Received
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {receipt.items.map((item, idx) => (
                                    <tr
                                        key={item.id}
                                        className={`border-b last:border-0 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-muted/20'}`}
                                    >
                                        <td className="px-4 py-3">
                                            <div>
                                                <p className="font-medium">{item.productVariant.name}</p>
                                                <p className="text-xs text-muted-foreground">{item.productVariant.product.name}</p>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                                                {item.productVariant.skuCode}
                                            </code>
                                        </td>
                                        <td className="px-4 py-3 text-right font-semibold tabular-nums">
                                            {Number(item.receivedQty).toFixed(2)}{' '}
                                            <span className="text-xs font-normal text-muted-foreground">
                                                {item.productVariant.primaryUnit}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* Footer Meta */}
            <Card className="bg-muted/30">
                <CardContent className="pt-4 pb-4">
                    <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
                        <div className="flex items-center gap-2">
                            <User className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-muted-foreground">Received by:</span>
                            <span className="font-medium">{receipt.createdBy?.name ?? '—'}</span>
                        </div>
                        {receipt.notes && (
                            <>
                                <Separator orientation="vertical" className="h-4 hidden sm:block" />
                                <div className="flex items-center gap-2">
                                    <ClipboardList className="w-3.5 h-3.5 text-muted-foreground" />
                                    <span className="text-muted-foreground">Notes:</span>
                                    <span className="font-medium">{receipt.notes}</span>
                                </div>
                            </>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
