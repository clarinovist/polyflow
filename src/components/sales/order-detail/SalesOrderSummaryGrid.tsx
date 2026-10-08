import {
    CircleDollarSign,
    Factory,
    PackageCheck,
    ReceiptText,
    Truck,
    UserRound,
} from 'lucide-react';
import { WorkflowSummaryGrid } from '@/components/workflow-detail/WorkflowSummaryGrid';
import { formatRupiah } from '@/lib/utils/utils';
import type { SerializedSalesOrder } from '../sales-order-types';

interface SalesOrderSummaryGridProps {
    order: SerializedSalesOrder;
    customerLabel: string;
    warehouseMode: boolean;
    isMaklonOrder: boolean;
}

export function SalesOrderSummaryGrid({
    order,
    customerLabel,
    warehouseMode,
    isMaklonOrder,
}: SalesOrderSummaryGridProps) {
    const deliveredVariants = order.items.filter(
        (item) => Number(item.deliveredQty) >= Number(item.quantity),
    ).length;
    const activeDeliveries = (order.deliveryOrders ?? []).filter((delivery) =>
        ['PENDING', 'LOADING', 'SHIPPED', 'IN_TRANSIT', 'ARRIVED'].includes(
            delivery.status,
        ),
    ).length;
    const productionInProgress = order.productionOrders.filter((production) =>
        ['DRAFT', 'RELEASED', 'IN_PROGRESS', 'WAITING_MATERIAL'].includes(
            production.status,
        ),
    ).length;

    return (
        <WorkflowSummaryGrid
            label="Ringkasan pesanan"
            items={[
                {
                    label: 'Pelanggan',
                    icon: <UserRound className="h-4 w-4" />,
                    value: customerLabel,
                    detail: order.orderType.replace(/_/g, ' '),
                },
                {
                    label: 'Pemenuhan',
                    icon: <PackageCheck className="h-4 w-4" />,
                    value:
                        deliveredVariants +
                        ' dari ' +
                        order.items.length +
                        ' varian terkirim',
                    detail: isMaklonOrder
                        ? productionInProgress + ' proses produksi aktif'
                        : activeDeliveries + ' pengiriman aktif',
                },
                {
                    label: isMaklonOrder ? 'Produksi' : 'Pengiriman',
                    icon: isMaklonOrder ? (
                        <Factory className="h-4 w-4" />
                    ) : (
                        <Truck className="h-4 w-4" />
                    ),
                    value: isMaklonOrder
                        ? order.productionOrders.length + ' perintah produksi'
                        : (order.deliveryOrders?.length ?? 0) + ' surat jalan',
                    detail:
                        order.sourceLocation?.name ||
                        'Lokasi belum ditentukan',
                },
                {
                    label: warehouseMode ? 'Item' : 'Komersial',
                    icon: warehouseMode ? (
                        <PackageCheck className="h-4 w-4" />
                    ) : order.invoices.length > 0 ? (
                        <ReceiptText className="h-4 w-4" />
                    ) : (
                        <CircleDollarSign className="h-4 w-4" />
                    ),
                    value: warehouseMode
                        ? order.items.length + ' varian'
                        : formatRupiah(Number(order.totalAmount ?? 0)),
                    detail: warehouseMode
                        ? 'Harga disembunyikan di portal gudang'
                        : order.invoices.length > 0
                          ? order.invoices.length + ' invoice terkait'
                          : 'Invoice belum dibuat',
                },
            ]}
        />
    );
}
