import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { formatWibDate } from '@/lib/utils/timezone';

export interface MachineOrderSummary {
    id: string;
    orderNumber: string;
    status: string;
    productName: string;
    plannedQuantity: number;
    primaryUnit: string;
    plannedStartDate: string | Date;
}

const statusLabels: Record<string, string> = {
    DRAFT: 'Draf',
    WAITING_MATERIAL: 'Menunggu Bahan',
    RELEASED: 'Dirilis',
    IN_PROGRESS: 'Dalam Proses',
};

export function MachineOrderList({
    machineCode,
    orders,
    activeOrderId,
}: {
    machineCode: string;
    orders: MachineOrderSummary[];
    activeOrderId?: string;
}) {
    // Put the actual running job first, then retain chronological planning order.
    const sortedOrders = [...orders].sort((a, b) =>
        Number(b.id === activeOrderId) - Number(a.id === activeOrderId) ||
        new Date(a.plannedStartDate).getTime() - new Date(b.plannedStartDate).getTime() ||
        a.orderNumber.localeCompare(b.orderNumber),
    );

    return (
        <section aria-label={`Daftar SPK ${machineCode}`} className="space-y-2 border-t pt-3">
            <h2 className="text-sm font-semibold">SPK di Mesin Ini ({orders.length})</h2>
            <p className="text-xs text-muted-foreground">
                SPK belum selesai, diurutkan menurut jadwal mulai. Riwayat tersedia di History.
            </p>
            {sortedOrders.length === 0 ? (
                <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                    Belum ada SPK yang dialokasikan.
                </p>
            ) : (
                <ul className="space-y-2">
                    {sortedOrders.map((order) => (
                        <li key={order.id}>
                            <Link
                                href={`/production/orders/${order.id}`}
                                className="block min-h-11 space-y-1.5 rounded-md border p-3 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <span className="block break-words text-sm font-semibold">{order.orderNumber}</span>
                                <Badge variant={order.id === activeOrderId ? 'default' : 'secondary'}>
                                    {order.id === activeOrderId ? 'Sedang Dikerjakan' : statusLabels[order.status] ?? order.status}
                                </Badge>
                                <span className="block break-words text-sm">{order.productName}</span>
                                <span className="block text-xs text-muted-foreground">
                                    Rencana: {order.plannedQuantity.toLocaleString('id-ID', { maximumFractionDigits: 4 })} {order.primaryUnit}
                                </span>
                                <span className="block text-xs text-muted-foreground">
                                    Jadwal: {formatWibDate(order.plannedStartDate)}
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
