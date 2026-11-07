import { getVehicles } from '@/actions/sales/vehicles';
import { getFleetServiceAlerts } from '@/actions/sales/vehicle-service';
import { FleetOverview } from '@/components/sales/vehicles/FleetOverview';
import { salesLabels } from '@/lib/labels';
import { serializeData } from '@/lib/utils/utils';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Car, Gauge } from 'lucide-react';

export default async function VehiclesPage() {
    const [vehiclesRes, alertsRes] = await Promise.all([getVehicles(), getFleetServiceAlerts()]);
    const vehicles =
        vehiclesRes.success && vehiclesRes.data
            ? serializeData(vehiclesRes.data)
            : [];

    return (
        <div className="p-4 md:p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        <Car className="h-8 w-8 text-muted-foreground" />
                        {salesLabels.fleet}
                    </h1>
                    <p className="text-muted-foreground">
                        {salesLabels.fleetDesc}
                    </p>
                </div>
                <Button asChild variant="outline" className="min-h-11">
                    <Link href="/sales/vehicles/km"><Gauge className="h-4 w-4" />Isi KM truk</Link>
                </Button>
            </div>

            {vehiclesRes.success ? <FleetOverview vehicles={vehicles} serviceAlerts={alertsRes.success ? alertsRes.data : null} /> : <div role="alert" className="space-y-2 rounded-lg border p-4">
                <p>Daftar armada gagal dimuat. {vehiclesRes.error}</p>
                {/* Full navigation retries the failed server read, not a cached same-route RSC. */}
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                <a href="/sales/vehicles" className="underline">Muat ulang daftar armada</a>
            </div>}
        </div>
    );
}
