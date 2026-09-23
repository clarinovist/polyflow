import { getVehicles } from '@/actions/sales/vehicles';
import { FleetOverview } from '@/components/sales/vehicles/FleetOverview';
import { salesLabels } from '@/lib/labels';
import { serializeData } from '@/lib/utils/utils';
import { Car } from 'lucide-react';

export default async function VehiclesPage() {
    const vehiclesRes = await getVehicles();
    const vehicles =
        vehiclesRes.success && vehiclesRes.data
            ? serializeData(vehiclesRes.data)
            : [];

    return (
        <div className="p-4 md:p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        <Car className="h-8 w-8 text-muted-foreground" />
                        {salesLabels.fleet}
                    </h1>
                    <p className="text-muted-foreground">
                        {salesLabels.fleetDesc}
                    </p>
                </div>
            </div>

            {vehiclesRes.success ? <FleetOverview vehicles={vehicles} /> : <div role="alert" className="space-y-2 rounded-lg border p-4">
                <p>Daftar armada gagal dimuat. {vehiclesRes.error}</p>
                {/* Full navigation retries the failed server read, not a cached same-route RSC. */}
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                <a href="/sales/vehicles" className="underline">Muat ulang daftar armada</a>
            </div>}
        </div>
    );
}
