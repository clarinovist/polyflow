'use client';

import { useState, useMemo } from 'react';

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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { format, differenceInDays } from 'date-fns';
import { ClipboardCheck, ArrowRight, XCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { ProductionPlanningDialog } from './ProductionPlanningDialog';
import { cancelOrderFromPlanning } from '@/actions/production/production';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { productionComponentLabels } from '@/lib/labels';

interface ProductionRequestsClientProps {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    orders: any[];
}

type DateRange = 'all' | '7d' | '30d' | '90d';

export function ProductionRequestsClient({ orders }: ProductionRequestsClientProps) {
    const router = useRouter();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [selectedOrder, setSelectedOrder] = useState<any>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
    const [filterCustomer, setFilterCustomer] = useState<string>('all');
    const [filterDateRange, setFilterDateRange] = useState<DateRange>('all');
    const [cancellingId, setCancellingId] = useState<string | null>(null);

    // Get unique customers for filter
    const customers = useMemo(
        () => [...new Set(orders.map(o => o.customer?.name).filter(Boolean))],
        [orders]
    );

    // Filter orders
    const filteredOrders = useMemo(() => {
        return orders.filter(order => {
            if (filterCustomer !== 'all' && order.customer?.name !== filterCustomer) return false;

            if (filterDateRange !== 'all') {
                const orderDate = new Date(order.orderDate);
                const now = new Date();
                const daysMap: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 };
                const daysAgo = daysMap[filterDateRange];
                if (daysAgo) {
                    const cutoff = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
                    if (orderDate < cutoff) return false;
                }
            }

            return true;
        });
    }, [orders, filterCustomer, filterDateRange]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleProcess = (order: any) => {
        setSelectedOrder(order);
        setIsDialogOpen(true);
    };

    const handleOrderCreated = () => {
        setIsDialogOpen(false);
        router.refresh();
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleCancel = async (order: any) => {
        if (!confirm(`Batalkan order ${order.orderNumber}?`)) return;

        setCancellingId(order.id);
        try {
            const result = await cancelOrderFromPlanning(order.id);
            if (result && result.success !== false) {
                toast.success(`Order ${order.orderNumber} berhasil dibatalkan`);
                router.refresh();
            } else {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                toast.error((result as any)?.error || 'Gagal membatalkan order');
            }
        } catch {
            toast.error('Gagal membatalkan order');
        } finally {
            setCancellingId(null);
        }
    };

    const hasActiveFilters = filterCustomer !== 'all' || filterDateRange !== 'all';

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ClipboardCheck className="h-5 w-5" />
                        {productionComponentLabels.incomingRequests}
                    </CardTitle>
                    <CardDescription>
                        Queue of confirmed Sales Orders waiting for production planning.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {/* Filters */}
                    <div className="flex flex-wrap items-center gap-3 mb-4">
                        <Select value={filterCustomer} onValueChange={setFilterCustomer}>
                            <SelectTrigger className="w-[200px]">
                                <SelectValue placeholder="Semua Customer" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Semua Customer</SelectItem>
                                {customers.map(c => (
                                    <SelectItem key={c} value={c!}>{c}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={filterDateRange} onValueChange={(v) => setFilterDateRange(v as DateRange)}>
                            <SelectTrigger className="w-[160px]">
                                <SelectValue placeholder="Semua Waktu" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Semua Waktu</SelectItem>
                                <SelectItem value="7d">7 Hari Terakhir</SelectItem>
                                <SelectItem value="30d">30 Hari Terakhir</SelectItem>
                                <SelectItem value="90d">90 Hari Terakhir</SelectItem>
                            </SelectContent>
                        </Select>

                        {hasActiveFilters && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => { setFilterCustomer('all'); setFilterDateRange('all'); }}
                            >
                                Reset Filter
                            </Button>
                        )}

                        <span className="text-xs text-muted-foreground ml-auto">
                            {filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''}
                        </span>
                    </div>

                    {filteredOrders.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            {hasActiveFilters
                                ? 'Tidak ada order yang cocok dengan filter.'
                                : 'Tidak ada permintaan pending ditemukan.'}
                        </div>
                    ) : (
                        <div className="rounded-md border overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-8" />
                                        <TableHead>Order #</TableHead>
                                        <TableHead>Tanggal</TableHead>
                                        <TableHead>Customer</TableHead>
                                        <TableHead>Items</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">{productionComponentLabels.actions}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredOrders.map((order) => {
                                        const isExpanded = expandedOrderId === order.id;
                                        const orderAge = differenceInDays(new Date(), new Date(order.orderDate));

                                        return (
                                            <>
                                                <TableRow
                                                    key={order.id}
                                                    className="cursor-pointer hover:bg-muted/50"
                                                    onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                                                >
                                                    <TableCell className="w-8 px-2">
                                                        {isExpanded
                                                            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                                            : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                                        }
                                                    </TableCell>
                                                    <TableCell className="font-medium">{order.orderNumber}</TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-2">
                                                            <span>{format(new Date(order.orderDate), 'PP')}</span>
                                                            {orderAge > 30 && (
                                                                <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 text-[10px] py-0 h-5">
                                                                    {orderAge} hari
                                                                </Badge>
                                                            )}
                                                        </div>
                                                    </TableCell>
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
                                                        <Badge variant="outline" className="bg-info/10 text-info border-info/20">
                                                            {order.status}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                                        <div className="flex items-center justify-end gap-2">
                                                            <Button
                                                                size="sm"
                                                                variant="destructive"
                                                                disabled={cancellingId === order.id}
                                                                onClick={() => handleCancel(order)}
                                                            >
                                                                <XCircle className="mr-1 h-3 w-3" />
                                                                {cancellingId === order.id ? '...' : 'Batal'}
                                                            </Button>
                                                            <Button size="sm" onClick={() => handleProcess(order)}>
                                                                Proses <ArrowRight className="ml-1 h-3 w-3" />
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                                {isExpanded && (
                                                    <TableRow key={`${order.id}-detail`}>
                                                        <TableCell colSpan={7} className="bg-muted/30 p-4">
                                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
                                                                <div>
                                                                    <p className="font-semibold text-foreground mb-1">Detail Order</p>
                                                                    <div className="space-y-0.5 text-muted-foreground">
                                                                        <p>Order #: {order.orderNumber}</p>
                                                                        <p>Tanggal: {format(new Date(order.orderDate), 'PP')}</p>
                                                                        <p>Status: {order.status}</p>
                                                                        {order.notes && <p>Catatan: {order.notes}</p>}
                                                                    </div>
                                                                </div>
                                                                <div>
                                                                    <p className="font-semibold text-foreground mb-1">Customer</p>
                                                                    <div className="space-y-0.5 text-muted-foreground">
                                                                        <p>{order.customer?.name || 'Internal'}</p>
                                                                        {order.customer?.phone && <p>Telp: {order.customer.phone}</p>}
                                                                        {order.customer?.billingAddress && (
                                                                            <p className="text-xs">{order.customer.billingAddress}</p>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <div>
                                                                    <p className="font-semibold text-foreground mb-1">Items ({order.items.length})</p>
                                                                    <div className="space-y-0.5 text-muted-foreground">
                                                                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                                                        {order.items.map((item: any) => (
                                                                            <p key={item.id}>
                                                                                {item.productVariant.product.name} × {Number(item.quantity)} {item.productVariant.primaryUnit}
                                                                            </p>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
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
