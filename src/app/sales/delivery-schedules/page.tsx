import { getDeliverySchedules } from "@/actions/sales/delivery-schedules";
import { ScheduleListClient } from "@/components/sales/schedules/ScheduleListClient";
import { salesLabels } from "@/lib/labels";
import { CalendarDays } from "lucide-react";
import type { ComponentProps } from "react";

type ScheduleRow = NonNullable<
  Extract<Awaited<ReturnType<typeof getDeliverySchedules>>, { success: true }>["data"]
>[number];

export default async function DeliverySchedulesPage() {
  const schedulesRes = await getDeliverySchedules();
  const rawSchedules =
    schedulesRes.success && schedulesRes.data ? schedulesRes.data : [];
  // Serialize Date fields for client
  const schedules = rawSchedules.map((s: ScheduleRow) => ({
    ...s,
    weekStart: s.weekStart?.toISOString?.() || s.weekStart,
    weekEnd: s.weekEnd?.toISOString?.() || s.weekEnd,
    createdAt: s.createdAt?.toISOString?.() || s.createdAt,
    updatedAt: s.updatedAt?.toISOString?.() || s.updatedAt,
    // Bridge: schema renamed vehicles→trips, component still expects `vehicles`
    vehicles: (s.trips || []).map((sv: ScheduleRow["trips"][number]) => ({
      id: sv.id,
      vehicleId: sv.vehicleId,
      vehicle: sv.vehicle,
      orders: sv.orders || [],
    })),
  }));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <CalendarDays className="h-8 w-8 text-blue-600" />
            {salesLabels.deliverySchedules}
          </h1>
          <p className="text-muted-foreground">{salesLabels.deliverySchedulesDesc}</p>
        </div>
      </div>

      <ScheduleListClient
        schedules={
          schedules as unknown as ComponentProps<
            typeof ScheduleListClient
          >["schedules"]
        }
      />
    </div>
  );
}
