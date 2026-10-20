import { getDeliveryLoadWeightKg } from '@/lib/sales/delivery-weight';
import type { DeliveryOrderDetailData } from './types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Truck } from 'lucide-react';
import { EditDeliveryPricingDialog } from '@/components/sales/EditDeliveryPricingDialog';

interface DeliveryFleetCardProps {
    order: DeliveryOrderDetailData;
    warehouseMode: boolean;
}

export function DeliveryFleetCard({
    order,
    warehouseMode,
}: DeliveryFleetCardProps) {
    const loadWeight = getDeliveryLoadWeightKg(order.items ?? []);
    const differs =
        loadWeight != null &&
        order.estimatedWeightKg != null &&
        Math.abs(loadWeight - Number(order.estimatedWeightKg)) > 0.01;
    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                        <Truck className="h-5 w-5" />
                        Armada & Tarif
                    </CardTitle>
                    {!warehouseMode && order.status !== 'CANCELLED' && (
                        <EditDeliveryPricingDialog
                            order={order}
                            customerId={
                                order.salesOrder?.customerId ??
                                order.salesOrder?.customer?.id ??
                                null
                            }
                        />
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                {differs && (
                    <p
                        role="status"
                        className="rounded-md border border-amber-400 p-3 text-sm"
                    >
                        Berat item SJ sekarang{' '}
                        {loadWeight.toLocaleString('id-ID')} kg, berbeda dari
                        dasar tarif tersimpan{' '}
                        {Number(order.estimatedWeightKg).toLocaleString(
                            'id-ID',
                        )}{' '}
                        kg. Ongkir tidak berubah otomatis.{' '}
                        {warehouseMode
                            ? 'Minta Sales memeriksa berat dan tarif.'
                            : 'Periksa melalui Edit Tarif & Berat sebelum mengirim.'}
                    </p>
                )}
                <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                        <span className="text-sm text-muted-foreground">
                            Kendaraan
                        </span>
                        <p className="font-medium">
                            {order.vehicle
                                ? `${order.vehicle.plateNumber} — ${order.vehicle.name}`
                                : '—'}
                        </p>
                    </div>
                    <div>
                        <span className="text-sm text-muted-foreground">
                            Kepemilikan
                        </span>
                        <p className="font-medium">
                            {order.vehicle?.ownershipType === 'FACTORY'
                                ? 'Pabrik'
                                : order.vehicle?.ownershipType === 'PRIVATE'
                                  ? 'Perorangan'
                                  : '—'}
                        </p>
                    </div>
                    <div>
                        <span className="text-sm text-muted-foreground">
                            Sopir
                        </span>
                        <p className="font-medium">
                            {order.vehicle?.driverName || '—'}
                        </p>
                    </div>
                    <div>
                        <span className="text-sm text-muted-foreground">
                            Rute
                        </span>
                        <p className="font-medium">
                            {order.appliedRouteName || 'Semua Rute'}
                        </p>
                    </div>
                    <div>
                        <span className="text-sm text-muted-foreground">
                            Tipe Tarif
                        </span>
                        <p className="font-medium">
                            {order.appliedRateType === 'PER_KG'
                                ? 'Per Kg'
                                : order.appliedRateType === 'FLAT_RATE'
                                  ? 'Flat Rate'
                                  : '—'}
                        </p>
                    </div>
                    <div>
                        <span className="text-sm text-muted-foreground">
                            Berat dasar tarif tersimpan
                        </span>
                        <p className="font-medium">
                            {order.estimatedWeightKg != null
                                ? `${Number(order.estimatedWeightKg)} Kg`
                                : '—'}
                        </p>
                    </div>
                    <div>
                        <span className="text-sm text-muted-foreground">
                            Biaya Operasional / Tarif
                        </span>
                        <p className="font-medium">
                            {order.appliedCostRate
                                ? new Intl.NumberFormat('id-ID', {
                                      style: 'currency',
                                      currency: 'IDR',
                                      minimumFractionDigits: 0,
                                  }).format(Number(order.appliedCostRate))
                                : '—'}
                        </p>
                    </div>
                    <div>
                        <span className="text-sm text-muted-foreground">
                            Tagihan Pelanggan / Tarif
                        </span>
                        <p className="font-medium">
                            {order.appliedChargeRate
                                ? new Intl.NumberFormat('id-ID', {
                                      style: 'currency',
                                      currency: 'IDR',
                                      minimumFractionDigits: 0,
                                  }).format(Number(order.appliedChargeRate))
                                : '—'}
                        </p>
                    </div>
                </div>
                {(order.totalCost != null || order.totalCharge != null) && (
                    <div className="border-t pt-3 grid grid-cols-2 gap-3 text-sm">
                        <div>
                            <span className="text-sm text-muted-foreground">
                                Total Biaya Operasional
                            </span>
                            <p className="font-semibold text-base">
                                {order.totalCost != null
                                    ? new Intl.NumberFormat('id-ID', {
                                          style: 'currency',
                                          currency: 'IDR',
                                          minimumFractionDigits: 0,
                                      }).format(Number(order.totalCost))
                                    : '—'}
                            </p>
                        </div>
                        <div>
                            <span className="text-sm text-muted-foreground">
                                Total Tagihan Pelanggan
                            </span>
                            <p className="font-semibold text-base text-emerald-600 dark:text-emerald-400">
                                {order.totalCharge != null
                                    ? new Intl.NumberFormat('id-ID', {
                                          style: 'currency',
                                          currency: 'IDR',
                                          minimumFractionDigits: 0,
                                      }).format(Number(order.totalCharge))
                                    : '—'}
                            </p>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
