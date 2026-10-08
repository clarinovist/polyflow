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
import { id } from 'date-fns/locale';
import { formatRupiah } from '@/lib/utils/utils';
import { getStatusLabel, salesLabels } from '@/lib/labels';
import { ProductionStatusCard } from '../ProductionStatusCard';
import type {
    SalesOrderDetailClientProps,
    SerializedSalesOrder,
} from '../sales-order-types';

interface OrderSidebarProps {
    order: SerializedSalesOrder;
    warehouseMode: boolean;
    currentUserRole: SalesOrderDetailClientProps['currentUserRole'];
    canPlan: SalesOrderDetailClientProps['canPlan'];
}

export function OrderSidebar({
    order,
    warehouseMode,
    currentUserRole,
    canPlan,
}: OrderSidebarProps) {
    return (
        <div className="min-w-0 space-y-6">
            {/* INVOICES CARD */}
            {!warehouseMode && (
                <Card className={order.invoices.length === 0 ? 'gap-3 py-4' : undefined}>
                    <CardHeader>
                        <CardTitle>{salesLabels.invoice}</CardTitle>
                        {order.invoices.length > 0 && (
                            <CardDescription>
                                Invoice yang diterbitkan untuk pesanan ini
                            </CardDescription>
                        )}
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
                                                    'd MMMM yyyy',
                                                    { locale: id },
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

            <ProductionStatusCard
                salesOrderId={order.id}
                status={order.status}
                productionOrders={order.productionOrders}
                items={order.items}
                currentUserRole={currentUserRole}
                canPlan={canPlan}
            />
        </div>
    );
}
