import { getDeliverySchedules } from '@/actions/sales/delivery-schedules';
import { ScheduleListClient } from '@/components/sales/schedules/ScheduleListClient';
import { salesLabels } from '@/lib/labels';
import type { ComponentProps } from 'react';

export default async function DeliverySchedulesPage() {
    const schedulesRes = await getDeliverySchedules();
    // Only pass the fields used by the list; trip vehicles can contain Decimals.
    const schedules: ComponentProps<typeof ScheduleListClient>['schedules'] =
        schedulesRes.success && schedulesRes.data
            ? schedulesRes.data.map((schedule) => ({
                  id: schedule.id,
                  scheduleNumber: schedule.scheduleNumber,
                  weekStart: schedule.weekStart.toISOString(),
                  weekEnd: schedule.weekEnd.toISOString(),
                  status: schedule.status,
                  vehicles: schedule.trips.map((trip) => ({
                      orders: trip.orders,
                  })),
              }))
            : [];

    return (
        <div className="mx-auto w-full max-w-screen-2xl space-y-5 p-4 md:p-6">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">
                    {salesLabels.deliverySchedules}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    {salesLabels.deliverySchedulesDesc}
                </p>
            </div>
            <ScheduleListClient
                schedules={schedules}
                loadError={!schedulesRes.success}
            />
        </div>
    );
}
