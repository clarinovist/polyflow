import { getDeliveryLoadWeightKg } from '@/lib/sales/delivery-weight';
import type { DeliveryOrderDetailData } from './types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, MapPin, Scale, User } from 'lucide-react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

interface DeliveryInformationCardProps {
    order: DeliveryOrderDetailData;
}

export function DeliveryInformationCard({
    order,
}: DeliveryInformationCardProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Informasi Pengiriman</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                        <User className="h-4 w-4" /> Pelanggan
                    </p>
                    <p className="font-medium">
                        {order.salesOrder?.customer?.name || 'N/A'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                        {order.salesOrder?.customer?.shippingAddress}
                    </p>
                </div>

                <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                        <MapPin className="h-4 w-4" /> Asal Gudang
                    </p>
                    <p className="font-medium text-sm">
                        {order.sourceLocation?.name || '—'}
                    </p>
                </div>

                <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                        <Calendar className="h-4 w-4" /> Tanggal Surat Jalan
                    </p>
                    <p className="font-medium text-sm">
                        {format(new Date(order.deliveryDate), 'd MMMM yyyy', {
                            locale: id,
                        })}
                    </p>
                </div>

                {order.stockCommittedAt && (
                    <div className="space-y-2">
                        <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                            <Calendar className="h-4 w-4" /> Tanggal Penyerahan
                            Aktual
                        </p>
                        <p className="font-medium text-sm">
                            {format(
                                new Date(order.stockCommittedAt),
                                'd MMMM yyyy',
                                { locale: id },
                            )}
                        </p>
                    </div>
                )}

                <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                        <User className="h-4 w-4" /> Disiapkan Oleh
                    </p>
                    <p className="font-medium text-sm">
                        {order.createdBy?.name || 'Sistem'}
                    </p>
                </div>

                <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                        <MapPin className="h-4 w-4" /> Alamat Tujuan
                    </p>
                    <p className="font-medium text-sm">
                        {order.destinationAddress ||
                            order.salesOrder?.customer?.shippingAddress ||
                            order.salesOrder?.customer?.billingAddress ||
                            '—'}
                    </p>
                </div>

                {getDeliveryLoadWeightKg(order.items ?? []) != null && (
                    <div className="space-y-2">
                        <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                            <Scale className="h-4 w-4" /> Berat item SJ
                        </p>
                        <p className="font-medium text-sm">
                            {getDeliveryLoadWeightKg(
                                order.items ?? [],
                            )?.toLocaleString('id-ID')}{' '}
                            kg
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
