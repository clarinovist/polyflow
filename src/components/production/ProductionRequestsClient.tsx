'use client';

import { useState } from 'react';

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { ClipboardCheck, ArrowRight } from 'lucide-react';
import { ProductionPlanningDialog } from './ProductionPlanningDialog';
import { useRouter } from 'next/navigation';

// Quick type definition based on what we see in other files, 
// ideally we import this from a shared types file if it existed.
// For now, I'll use `any` for the order prop to avoid complex type reconstruction in this step,
// but I'll cast it safely in the component.
interface ProductionRequestsClientProps {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    orders: any[];
}

export function ProductionRequestsClient({ orders }: ProductionRequestsClientProps) {
    const router = useRouter();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [selectedOrder, setSelectedOrder] = useState<any>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleProcess = (order: any) => {
        setSelectedOrder(order);
        setIsDialogOpen(true);
    };

    const handleOrderCreated = () => {
        setIsDialogOpen(false);
        router.refresh();
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ClipboardCheck className="h-5 w-5" />
                        Incoming Production Requests
                    </CardTitle>
                    <CardDescription>
                        Queue of confirmed Sales Orders waiting for production planning.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {orders.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            No pending requests found.
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Order #</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Customer</TableHead>
                                    <TableHead>Items</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {orders.map((order) => (
                                    <TableRow key={order.id}>
                                        <TableCell className="font-medium">{order.orderNumber}</TableCell>
                                        <TableCell>{format(new Date(order.orderDate), 'PP')}</TableCell>
                                        <TableCell>{order.customer?.name || 'Internal'}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1">
                                                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                                {order.items.slice(0, 2).map((item: any) => (
                                                    <span key={item.id} className="text-xs text-muted-foreground">
                                                        {item.productVariant.product.name} ({Number(item.quantity)})
                                                    </span>
                                                ))}
                                                {order.items.length > 2 && (
                                                    <span className="text-xs text-muted-foreground italic">
                                                        + {order.items.length - 2} more...
                                                    </span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                                                {order.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button size="sm" onClick={() => handleProcess(order)}>
                                                Process <ArrowRight className="ml-2 h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {selectedOrder && (
                <ProductionPlanningDialog
                    isOpen={isDialogOpen}
                    onClose={() => setIsDialogOpen(false)}
                    salesOrderId={selectedOrder.id}
                    salesOrderNumber={selectedOrder.orderNumber}
                    onOrderCreated={handleOrderCreated}
                />
            )}
        </div>
    );
}
