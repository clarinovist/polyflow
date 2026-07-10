import { getVehicles } from "@/actions/sales/vehicles";
import { VehicleTable } from "@/components/sales/vehicles/VehicleTable";
import { salesLabels } from "@/lib/labels";
import { serializeData } from "@/lib/utils/utils";
import { Car } from "lucide-react";

export default async function VehiclesPage() {
  const vehiclesRes = await getVehicles();
  const vehicles =
    vehiclesRes.success && vehiclesRes.data ? serializeData(vehiclesRes.data) : [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Car className="h-8 w-8 text-blue-600" />
            {salesLabels.fleet}
          </h1>
          <p className="text-muted-foreground">{salesLabels.fleetDesc}</p>
        </div>
      </div>

      <VehicleTable vehicles={vehicles} />
    </div>
  );
}
