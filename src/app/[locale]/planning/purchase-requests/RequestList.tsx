'use client';

import { useState } from 'react';
import { PurchaseRequest, PurchaseRequestItem, ProductVariant, Product } from '@prisma/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { convertToPo } from './actions';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

type RequestWithRelations = PurchaseRequest & {
    items: (PurchaseRequestItem & {
        productVariant: ProductVariant & {
            product: Product
        }
    })[];
    salesOrder?: { orderNumber: string } | null;
    createdBy: { name: string | null };
};

type Supplier = {
    id: string;
    name: string;
};

interface RequestListProps {
    requests: RequestWithRelations[];
    suppliers: Supplier[];
}

export function RequestList({ requests, suppliers }: RequestListProps) {
    const [selectedRequest, setSelectedRequest] = useState<RequestWithRelations | null>(null);
    const [isConvertOpen, setIsConvertOpen] = useState(false);
    const [selectedSupplier, setSelectedSupplier] = useState('');
    const [isConverting, setIsConverting] = useState(false);

    const handleConvertClick = (request: RequestWithRelations) => {
        setSelectedRequest(request);
        setSelectedSupplier('');
        setIsConvertOpen(true);
    };

    const handleConfirmConvert = async () => {
        if (!selectedRequest || !selectedSupplier) return;

        setIsConverting(true);
        try {
            const result = await convertToPo(selectedRequest.id, selectedSupplier);
            if (result.success) {
                toast.success("Purchase Order created successfully");
                setIsConvertOpen(false);
            }
        } catch (error) {
            toast.error("Failed to convert request");
            console.error(error);
        } finally {
            setIsConverting(false);
        }
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Purchase Requests</CardTitle>
                    <CardDescription>Manage internal requests for materials.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Request #</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Items</TableHead>
                                <TableHead>Source</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Priority</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {requests.map((req) => (
                                <TableRow key={req.id}>
                                    <TableCell className="font-medium">{req.requestNumber}</TableCell>
                                    <TableCell>{format(new Date(req.requestDate), 'dd MMM yyyy')}</TableCell>
                                    <TableCell>
                                        <div className="flex flex-col gap-1">
                                            {req.items.map(item => (
                                                <div key={item.id} className="text-sm">
                                                    <span className="font-semibold">{item.quantity.toString()}</span> x {item.productVariant.name}
                                                </div>
                                            ))}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {req.salesOrder ? (
                                            <Badge variant="outline">SO: {req.salesOrder.orderNumber}</Badge>
                                        ) : '-'}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={req.status === 'OPEN' ? 'default' : 'secondary'}>
                                            {req.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        {req.priority === 'URGENT' && <Badge variant="destructive">URGENT</Badge>}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {req.status === 'OPEN' && (
                                            <Button size="sm" onClick={() => handleConvertClick(req)}>Convert to PO</Button>
                                        )}
                                        {req.status === 'CONVERTED' && (
                                            <Button size="sm" variant="ghost" disabled>Converted</Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                            {requests.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                        No open purchase requests found.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Dialog open={isConvertOpen} onOpenChange={setIsConvertOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Convert to Purchase Order</DialogTitle>
                        <DialogDescription>
                            Select a supplier for <strong>{selectedRequest?.requestNumber}</strong>.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-4">
                        <label className="text-sm font-medium mb-2 block">Supplier</label>
                        <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select supplier..." />
                            </SelectTrigger>
                            <SelectContent>
                                {suppliers.map(s => (
                                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsConvertOpen(false)}>Cancel</Button>
                        <Button onClick={handleConfirmConvert} disabled={!selectedSupplier || isConverting}>
                            {isConverting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Create Draft PO
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
