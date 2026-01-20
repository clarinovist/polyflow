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
import { Search, MapPin, User, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';

type ReceiptWithRelations = {
    id: string;
    receiptNumber: string;
    receivedDate: Date;
    notes: string | null;
    purchaseOrder: {
        orderNumber: string;
    };
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
            r.purchaseOrder.orderNumber.toLowerCase().includes(searchTerm.toLowerCase())
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
                                        <Badge variant="secondary" className="font-normal">
                                            {gr._count.items} items
                                        </Badge>
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
