import { getDeliverySchedule } from "@/actions/sales/delivery-schedules";
import { ScheduleDetailClient } from "@/components/sales/schedules/ScheduleDetailClient";
import { redirect } from "next/navigation";

export default async function ScheduleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getDeliverySchedule(id);

  if (!result.success || !result.data) {
    redirect("/sales/delivery-schedules");
  }

  // Serialize Decimal fields for client
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const schedule = {
    ...result.data,
    weekStart: result.data.weekStart.toISOString(),
    weekEnd: result.data.weekEnd.toISOString(),
    createdAt: result.data.createdAt.toISOString(),
    updatedAt: result.data.updatedAt.toISOString(),
    // Bridge: schema renamed vehicles→trips, but component still expects `vehicles`
    vehicles: result.data.trips.map((sv: any) => ({
      id: sv.id,
      vehicleId: sv.vehicleId,
      departureDate: sv.departureDate?.toISOString() || null,
      routeName: sv.routeName,
      status: sv.status,
      sequence: sv.sequence,
      notes: sv.notes,
      createdAt: sv.createdAt.toISOString(),
      vehicle: sv.vehicle,
      orders: sv.orders.map((so: any) => ({
        ...so,
        createdAt: so.createdAt.toISOString(),
        plannedWeightKg: so.plannedWeightKg ? Number(so.plannedWeightKg) : null,
        // Legacy path: stop has deliveryOrder
        ...(so.deliveryOrder ? {
          deliveryOrder: {
            ...so.deliveryOrder,
            deliveryDate: so.deliveryOrder.deliveryDate?.toISOString() || null,
            createdAt: so.deliveryOrder.createdAt.toISOString(),
            updatedAt: so.deliveryOrder.updatedAt.toISOString(),
            totalCharge: so.deliveryOrder.totalCharge ? Number(so.deliveryOrder.totalCharge) : null,
            totalCost: so.deliveryOrder.totalCost ? Number(so.deliveryOrder.totalCost) : null,
            salesOrder: so.deliveryOrder.salesOrder ? {
              ...so.deliveryOrder.salesOrder,
              orderDate: so.deliveryOrder.salesOrder.orderDate.toISOString(),
              totalAmount: so.deliveryOrder.salesOrder.totalAmount ? Number(so.deliveryOrder.salesOrder.totalAmount) : null,
              customer: so.deliveryOrder.salesOrder.customer,
            } : null,
          },
        } : {}),
        // New path: stop has salesOrder directly
        ...(so.salesOrder ? {
          salesOrder: {
            ...so.salesOrder,
            orderDate: so.salesOrder.orderDate?.toISOString() || null,
            totalAmount: so.salesOrder.totalAmount ? Number(so.salesOrder.totalAmount) : null,
            customer: so.salesOrder.customer,
          },
        } : {}),
      })),
    })),
    createdBy: result.data.createdBy,
  };

  return <ScheduleDetailClient schedule={schedule} />;
}
