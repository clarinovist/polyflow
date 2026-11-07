import { getVehicle } from '@/actions/sales/vehicles';
import { getVehicleServiceStatus } from '@/actions/sales/vehicle-service';
import { VehicleServicePanel } from '@/components/sales/vehicles/VehicleServicePanel';
import { VehicleDetailClient } from '@/components/sales/vehicles/VehicleDetailClient';
import { redirect } from 'next/navigation';
import { VehicleDistanceHistory } from '@/components/sales/vehicles/VehicleDistanceHistory';

export default async function VehicleDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const [result, serviceRes] = await Promise.all([getVehicle(id), getVehicleServiceStatus(id)]);

    if (!result.success || !result.data) {
        redirect('/sales/vehicles');
    }
    // Serialize Decimal and Date fields for client component
    const vehicle = {
        ...result.data,
        capacityKg: result.data.capacityKg
            ? Number(result.data.capacityKg)
            : null,
        kirExpireDate: result.data.kirExpireDate?.toISOString() || null,
        tariffs: result.data.tariffs.map(
            (t: {
                id: string;
                rateType: string;
                costRate: unknown;
                chargeRate: unknown;
                minKg: unknown;
                validFrom: Date;
                validUntil: Date | null;
                routeName: string | null;
                notes: string | null;
                customerId: string | null;
                customer?: { id: string; name: string } | null;
            }) => ({
                id: t.id,
                rateType: t.rateType,
                costRate: Number(t.costRate),
                chargeRate: Number(t.chargeRate),
                minKg: t.minKg ? Number(t.minKg) : null,
                validFrom: t.validFrom.toISOString(),
                validUntil: t.validUntil?.toISOString() || null,
                routeName: t.routeName,
                notes: t.notes,
                customerId: t.customerId,
                customerName: t.customer?.name ?? null,
            }),
        ),
        _count: result.data._count,
    };

    const servicePanel = serviceRes.success
        ? <VehicleServicePanel view={serviceRes.data} />
        : <div role="alert" className="rounded-lg border p-4 text-sm">Pengingat servis gagal dimuat. {serviceRes.error}</div>;

    return <VehicleDetailClient vehicle={vehicle} servicePanel={servicePanel}>
        <VehicleDistanceHistory vehicleId={id} />
    </VehicleDetailClient>;
}
