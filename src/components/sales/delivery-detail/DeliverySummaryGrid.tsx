import { CalendarDays, MapPin, PackageCheck, Truck } from 'lucide-react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import type { DeliveryOrderDetailData } from './types';

interface DeliverySummaryGridProps {
    order: DeliveryOrderDetailData;
    isLoadVerified: boolean;
}

const summaryItemClass =
    'min-w-0 rounded-xl border bg-card px-4 py-3 text-card-foreground shadow-sm';

export function DeliverySummaryGrid({
    order,
    isLoadVerified,
}: DeliverySummaryGridProps) {
    const destination =
        order.destinationAddress ||
        order.salesOrder?.customer?.shippingAddress ||
        order.salesOrder?.customer?.billingAddress ||
        'Alamat belum tersedia';

    return (
        <section
            aria-label="Ringkasan pengiriman"
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
            <div className={summaryItemClass}>
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <MapPin className="h-4 w-4" /> Tujuan
                </div>
                <p className="mt-2 font-semibold">
                    {order.salesOrder?.customer?.name ||
                        'Customer belum tersedia'}
                </p>
                <p
                    className="mt-1 line-clamp-2 text-sm text-muted-foreground"
                    title={destination}
                >
                    {destination}
                </p>
            </div>
            <div className={summaryItemClass}>
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <CalendarDays className="h-4 w-4" /> Jadwal
                </div>
                <p className="mt-2 font-semibold">
                    {format(new Date(order.deliveryDate), 'd MMMM yyyy', {
                        locale: id,
                    })}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                    Dari{' '}
                    {order.sourceLocation?.name ||
                        'gudang belum ditentukan'}
                </p>
            </div>
            <div className={summaryItemClass}>
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Truck className="h-4 w-4" /> Armada
                </div>
                <p className="mt-2 font-semibold">
                    {order.vehicle
                        ? order.vehicle.plateNumber + ' — ' + order.vehicle.name
                        : 'Belum ditentukan'}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                    {order.vehicle?.driverName || 'Sopir belum ditentukan'}
                </p>
            </div>
            <div className={summaryItemClass}>
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <PackageCheck className="h-4 w-4" /> Muatan
                </div>
                <p className="mt-2 font-semibold">
                    {order.items?.length ?? 0} varian
                    {order.estimatedWeightKg
                        ? ' · ' +
                          Number(order.estimatedWeightKg).toLocaleString(
                              'id-ID',
                          ) +
                          ' kg'
                        : ''}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                    {isLoadVerified
                        ? 'Verifikasi muat terkunci'
                        : 'Verifikasi muat belum dikunci'}
                </p>
            </div>
        </section>
    );
}
