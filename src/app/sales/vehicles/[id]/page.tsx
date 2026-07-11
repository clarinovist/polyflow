import { getVehicle } from "@/actions/sales/vehicles";
import { VehicleDetailClient } from "@/components/sales/vehicles/VehicleDetailClient";
import { redirect } from "next/navigation";

export default async function VehicleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getVehicle(id);

  if (!result.success || !result.data) {
    redirect("/sales/vehicles");
  }
  // Serialize Decimal and Date fields for client component
  const vehicle = {
    ...result.data,
    capacityKg: result.data.capacityKg ? Number(result.data.capacityKg) : null,
    kirExpireDate: result.data.kirExpireDate?.toISOString() || null,
    tariffs: result.data.tariffs.map((t: { id: string; rateType: string; costRate: unknown; chargeRate: unknown; minKg: unknown; validFrom: Date; validUntil: Date | null; routeName: string | null; notes: string | null }) => ({
      id: t.id,
      rateType: t.rateType,
      costRate: Number(t.costRate),
      chargeRate: Number(t.chargeRate),
      minKg: t.minKg ? Number(t.minKg) : null,
      validFrom: t.validFrom.toISOString(),
      validUntil: t.validUntil?.toISOString() || null,
      routeName: t.routeName,
      notes: t.notes,
    })),
    _count: result.data._count,
  };

  return <VehicleDetailClient vehicle={vehicle} />;
}
