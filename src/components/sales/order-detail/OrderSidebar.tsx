import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { format } from 'date-fns';
import { formatRupiah } from '@/lib/utils/utils';
import { getStatusLabel, salesLabels } from '@/lib/labels';
import { ProductionStatusCard } from '../ProductionStatusCard';
import { EntityStatusTimeline } from '@/components/shared/EntityStatusTimeline';
import type {
    SalesOrderDetailClientProps,
    SerializedSalesOrder,
} from '../sales-order-types';

interface OrderSidebarProps {
    order: SerializedSalesOrder;
    warehouseMode: boolean;
    isMaklonOrder: boolean;
    currentUserRole: SalesOrderDetailClientProps['currentUserRole'];
    canPlan: SalesOrderDetailClientProps['canPlan'];
}

export function OrderSidebar({
    order,
    warehouseMode,
    isMaklonOrder,
    currentUserRole,
    canPlan,
}: OrderSidebarProps) {
    return (
        <div className="space-y-6">
            {/* INVOICES CARD */}
            {!warehouseMode && (
                <Card>
                    <CardHeader>
                        <CardTitle>{salesLabels.invoice}</CardTitle>
                        <CardDescription>
                            Invoice yang diterbitkan untuk order ini
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {order.invoices && order.invoices.length > 0 ? (
                            <ul className="space-y-4">
                                {order.invoices.map((inv) => (
                                    <li
                                        key={inv.id}
                                        className="border p-3 rounded-md hover:bg-muted/50 transition-colors"
                                    >
                                        <Link
                                            href={`/finance/invoices/sales/${inv.id}`}
                                            className="block"
                                        >
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
                                                    {inv.invoiceNumber}
                                                </span>
                                                <Badge
                                                    variant={
                                                        inv.status === 'PAID'
                                                            ? 'default'
                                                            : 'destructive'
                                                    }
                                                >
                                                    {getStatusLabel(
                                                        inv.status,
                                                        'finance',
                                                    )}
                                                </Badge>
                                            </div>
                                            <div className="text-sm text-muted-foreground mb-1">
                                                {format(
                                                    new Date(inv.invoiceDate),
                                                    'PP',
                                                )}
                                            </div>
                                            <div className="font-semibold">
                                                {formatRupiah(
                                                    Number(inv.totalAmount),
                                                )}
                                            </div>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                {salesLabels.emptyInvoices}
                            </p>
                        )}
                    </CardContent>
                </Card>
            )}

            <EntityStatusTimeline entityType="SalesOrder" entityId={order.id} />

            <ProductionStatusCard
                salesOrderId={order.id}
                status={order.status}
                productionOrders={order.productionOrders}
                items={order.items}
                currentUserRole={currentUserRole}
                canPlan={canPlan}
            />

            <Card>
                <CardHeader>
                    <CardTitle>
                        {isMaklonOrder
                            ? 'Riwayat Penutupan Jasa'
                            : 'Riwayat Pengiriman'}
                    </CardTitle>
                    <CardDescription>
                        {isMaklonOrder
                            ? 'Progres penutupan untuk order jasa maklon'
                            : 'Mutasi stok terkait order ini'}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {order.movements.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            {isMaklonOrder
                                ? 'Belum ada mutasi stok penutupan jasa yang tercatat dari sales. Konsumsi bahan dilacak dari eksekusi produksi.'
                                : 'Belum ada pengiriman.'}
                        </p>
                    ) : (
                        <ul className="space-y-4">
                            {order.movements.map((m) => (
                                <li
                                    key={m.id}
                                    className="text-sm border-l-2 border-purple-200 dark:border-purple-800/50 pl-4 py-1"
                                >
                                    <div className="font-medium">
                                        {isMaklonOrder
                                            ? `Recorded sales shipment movement ${Number(m.quantity)} units`
                                            : `Shipped ${Number(m.quantity)} units`}
                                    </div>
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
    );
}
