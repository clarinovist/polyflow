import type { DeliveryOrderDetailData } from './types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, MapPin, Scale, User } from 'lucide-react';
import { format } from 'date-fns';
import { salesLabels } from '@/lib/labels';

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
                    <label className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1">
                        <User className="h-3 w-3" /> Customer
                    </label>
                    <p className="font-medium">
                        {order.salesOrder?.customer?.name || 'N/A'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                        {order.salesOrder?.customer?.shippingAddress}
                    </p>
                </div>

                <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> Asal Gudang
                    </label>
                    <p className="font-medium text-sm">
                        {order.sourceLocation?.name}
                    </p>
                </div>

                <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1">
                        <Calendar className="h-3 w-3" />{' '}
                        {salesLabels.deliveryDate}
                    </label>
                    <p className="font-medium text-sm">
                        {format(new Date(order.deliveryDate), 'PPP')}
                    </p>
                </div>

                <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1">
                        <User className="h-3 w-3" /> Disiapkan Oleh
                    </label>
                    <p className="font-medium text-sm">
                        {order.createdBy?.name || 'Sistem'}
                    </p>
                </div>

                <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> Alamat Tujuan
                    </label>
                    <p className="font-medium text-sm">
                        {order.destinationAddress ||
                            order.salesOrder?.customer?.shippingAddress ||
                            order.salesOrder?.customer?.billingAddress ||
                            '—'}
                    </p>
                </div>

                {order.estimatedWeightKg && (
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1">
                            <Scale className="h-3 w-3" /> Estimasi Berat
                        </label>
                        <p className="font-medium text-sm">
                            {Number(order.estimatedWeightKg)} Kg
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
