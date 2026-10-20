import { getDeliveryLoadWeightKg } from '@/lib/sales/delivery-weight';
import { CalendarDays, MapPin, PackageCheck, Truck } from 'lucide-react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { WorkflowSummaryGrid } from '@/components/workflow-detail/WorkflowSummaryGrid';
import type { DeliveryOrderDetailData } from './types';

interface DeliverySummaryGridProps {
    order: DeliveryOrderDetailData;
    isLoadVerified: boolean;
}

export function DeliverySummaryGrid({
    order,
    isLoadVerified,
}: DeliverySummaryGridProps) {
    const loadWeight = getDeliveryLoadWeightKg(order.items ?? []);
    const destination =
        order.destinationAddress ||
        order.salesOrder?.customer?.shippingAddress ||
        order.salesOrder?.customer?.billingAddress ||
        'Alamat belum tersedia';

    return (
        <WorkflowSummaryGrid
            label="Ringkasan pengiriman"
            items={[
                {
                    label: 'Tujuan',
                    icon: <MapPin className="h-4 w-4" />,
                    value:
                        order.salesOrder?.customer?.name ||
                        'Customer belum tersedia',
                    detail: (
                        <p className="line-clamp-2" title={destination}>
                            {destination}
                        </p>
                    ),
                },
                {
                    label: 'Tanggal Surat Jalan',
                    icon: <CalendarDays className="h-4 w-4" />,
                    value: format(new Date(order.deliveryDate), 'd MMMM yyyy', {
                        locale: id,
                    }),
                    detail:
                        'Dari ' +
                        (order.sourceLocation?.name ||
                            'gudang belum ditentukan'),
                },
                ...(order.stockCommittedAt
                    ? [
                          {
                              label: 'Penyerahan Aktual',
                              icon: <PackageCheck className="h-4 w-4" />,
                              value: format(
                                  new Date(order.stockCommittedAt),
                                  'd MMMM yyyy',
                                  { locale: id },
                              ),
                              detail: 'Tanggal stok dan invoice draft',
                          },
                      ]
                    : []),
                {
                    label: 'Armada',
                    icon: <Truck className="h-4 w-4" />,
                    value: order.vehicle
                        ? order.vehicle.plateNumber + ' — ' + order.vehicle.name
                        : 'Belum ditentukan',
                    detail:
                        order.vehicle?.driverName || 'Sopir belum ditentukan',
                },
                {
                    label: 'Muatan',
                    icon: <PackageCheck className="h-4 w-4" />,
                    value:
                        (order.items?.length ?? 0) +
                        ' varian' +
                        (loadWeight != null
                            ? ' · ' + loadWeight.toLocaleString('id-ID') + ' kg'
                            : ''),
                    detail: (
                        <>
                            <p>
                                {loadWeight == null
                                    ? 'Berat muatan belum dapat dihitung untuk semua satuan.'
                                    : 'Berat dihitung dari item SJ saat ini.'}
                            </p>
                            <p>
                                {isLoadVerified
                                    ? 'Verifikasi muat terkunci'
                                    : 'Verifikasi muat belum dikunci'}
                            </p>
                        </>
                    ),
                },
            ]}
        />
    );
}
