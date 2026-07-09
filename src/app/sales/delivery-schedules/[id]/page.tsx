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
    vehicles: result.data.vehicles.map((sv: { id: string; vehicleId: string; departureDate: Date | null; notes: string | null; createdAt: Date; vehicle: any; orders: Array<{ id: string; createdAt: Date; deliveryOrder: any }> }) => ({
      id: sv.id,
      vehicleId: sv.vehicleId,
      departureDate: sv.departureDate?.toISOString() || null,
      notes: sv.notes,
      createdAt: sv.createdAt.toISOString(),
      vehicle: sv.vehicle,
      orders: sv.orders.map((so: { id: string; createdAt: Date; deliveryOrder: any }) => ({
        ...so,
        createdAt: so.createdAt.toISOString(),
        deliveryOrder: {
          ...so.deliveryOrder,
          deliveryDate: so.deliveryOrder.deliveryDate.toISOString(),
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
      })),
    })),
    createdBy: result.data.createdBy,
  };

  return <ScheduleDetailClient schedule={schedule} />;
}
