'use client';

import React, { useState, useMemo } from 'react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search, MapPin, User, Calendar, Building2 } from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';

type ReceiptWithRelations = {
    id: string;
    receiptNumber: string;
    receivedDate: Date;
    notes: string | null;
    purchaseOrder: {
        orderNumber: string;
        status: string;
        supplier: { name: string };
    };
    items: {
        id: string;
        receivedQty: number;
        productVariant: {
            name: string;
            skuCode: string;
            primaryUnit: string;
        };
    }[];
    location: {
        name: string;
    };
    createdBy: {
        name: string;
    };
    _count: {
        items: number;
    };
};

interface GoodsReceiptTableProps {
    receipts: ReceiptWithRelations[];
}

export function GoodsReceiptTable({ receipts }: GoodsReceiptTableProps) {
    const [searchTerm, setSearchTerm] = useState('');

    const filteredReceipts = useMemo(() => {
        return receipts.filter(r =>
            r.receiptNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
            r.purchaseOrder.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
            r.purchaseOrder.supplier.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [receipts, searchTerm]);

    return (
        <div className="space-y-4">
            <div className="relative max-w-sm">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Search receipt or PO number..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                />
            </div>

            <div className="rounded-md border bg-background overflow-hidden">
                <Table>
                    <TableHeader className="bg-muted/50">
                        <TableRow>
                            <TableHead className="w-[150px]">Receipt No</TableHead>
                            <TableHead>PO Reference</TableHead>
                            <TableHead>PO Status</TableHead>
                            <TableHead>Supplier</TableHead>
                            <TableHead>Received Date</TableHead>
                            <TableHead>Location</TableHead>
                            <TableHead>Items</TableHead>
                            <TableHead>Received By</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredReceipts.length > 0 ? (
                            filteredReceipts.map((gr) => (
                                <TableRow key={gr.id} className="hover:bg-muted/30 transition-colors">
                                    <TableCell className="font-mono font-medium">
                                        <Link
                                            href={`/dashboard/purchasing/receipts/${gr.id}`}
                                            className="text-emerald-600 hover:underline"
                                        >
                                            {gr.receiptNumber}
                                        </Link>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50">
                                            {gr.purchaseOrder.orderNumber}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant={gr.purchaseOrder.status === 'COMPLETED' ? 'default' : gr.purchaseOrder.status === 'PARTIAL_RECEIVED' ? 'secondary' : 'outline'}
                                            className={gr.purchaseOrder.status === 'COMPLETED' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
                                        >
                                            {gr.purchaseOrder.status.replace(/_/g, ' ')}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2 text-sm font-medium">
                                            <Building2 className="h-3 w-3 text-muted-foreground" />
                                            {gr.purchaseOrder.supplier.name}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-sm">
                                        <div className="flex items-center gap-2">
                                            <Calendar className="h-3 w-3 text-muted-foreground" />
                                            {format(new Date(gr.receivedDate), 'dd MMM yyyy')}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2 text-sm">
                                            <MapPin className="h-3 w-3 text-muted-foreground" />
                                            {gr.location.name}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button variant="ghost" className="h-auto p-0 hover:bg-transparent">
                                                    <Badge variant="secondary" className="font-normal cursor-pointer hover:bg-muted-foreground/20">
                                                        {gr._count.items} items
                                                    </Badge>
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-80 p-0" align="start">
                                                <div className="p-4 space-y-3">
                                                    <div className="space-y-1">
                                                        <h4 className="font-medium leading-none">Received Items</h4>
                                                        <p className="text-xs text-muted-foreground">
                                                            Items in receipt {gr.receiptNumber}
                                                        </p>
                                                    </div>
                                                    <div className="grid gap-3">
                                                        {gr.items.map((item) => (
                                                            <div key={item.id} className="flex justify-between items-start text-sm border-b pb-2 last:border-0 last:pb-0">
                                                                <div>
                                                                    <span className="block font-medium">{item.productVariant.name}</span>
                                                                    <span className="block text-xs text-muted-foreground">{item.productVariant.skuCode}</span>
                                                                </div>
                                                                <div className="text-right whitespace-nowrap font-medium">
                                                                    {item.receivedQty} {item.productVariant.primaryUnit}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </PopoverContent>
                                        </Popover>
                                    </TableCell>
                                    <TableCell className="text-sm">
                                        <div className="flex items-center gap-2">
                                            <User className="h-3 w-3 text-muted-foreground" />
                                            {gr.createdBy.name}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                                    No goods receipts found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
