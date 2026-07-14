import { getMachines } from '@/actions/production/machines';
import { getProductionOrders } from '@/actions/production/production-orders';
import { ProductionStatus } from '@prisma/client';
import { startOfDay, addDays, parseISO, isValid } from 'date-fns';
import { Calendar as CalendarIcon, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { planningLabels } from '@/lib/labels';
import { ScheduleBoardClient } from '@/components/production/schedule/ScheduleBoardClient';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Jadwal Produksi',
};

interface PageProps {
    searchParams: Promise<{ from?: string }>;
}

export default async function PpicSchedulePage({ searchParams }: PageProps) {
    const params = await searchParams;
    const machinesRes = await getMachines();
    const machines = machinesRes.success && machinesRes.data ? machinesRes.data : [];

    const ordersRes = await getProductionOrders();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allOrders = ordersRes as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orders = allOrders.filter((o: any) =>
        [ProductionStatus.RELEASED, ProductionStatus.IN_PROGRESS, ProductionStatus.DRAFT].includes(o.status)
    );

    // Parse ?from=YYYY-MM-DD for week navigation
    const today = startOfDay(new Date());
    let timelineStart = today;
    if (params.from) {
        const parsed = parseISO(params.from);
        if (isValid(parsed)) {
            timelineStart = startOfDay(parsed);
        }
    }
    const timelineDays = Array.from({ length: 7 }, (_, i) => addDays(timelineStart, i));

    // Map orders to shape expected by client components
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clientOrders = orders.map((o: any) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        bomName: o.bom?.name ?? '',
        status: o.status,
        plannedQuantity: o.plannedQuantity,
        machineId: o.machineId,
        plannedStartDate: o.plannedStartDate,
    }));

    // Map machines to shape expected by client components
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clientMachines = machines.map((m: any) => ({
        id: m.id,
        code: m.code,
        type: m.type,
        status: m.status,
    }));

    return (
        <div className="p-4 md:p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                        {planningLabels.productionSchedule}
                    </h1>
                    <p className="text-sm md:text-base text-muted-foreground">
                        {planningLabels.scheduleDesc}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="outline" size="sm" className="flex-1 sm:flex-none" disabled>
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {planningLabels.monthView}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>{planningLabels.monthViewDisabled}</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button className="bg-zinc-900 dark:bg-zinc-950 hover:bg-zinc-800 flex-1 sm:flex-none" disabled>
                                    <Layers className="mr-2 h-4 w-4" />
                                    {planningLabels.optimizeBatches}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>{planningLabels.optimizeBatchesDisabled}</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            </div>

            {/* Board — client components for interactivity */}
            <ScheduleBoardClient
                machines={clientMachines}
                orders={clientOrders}
                timelineDays={timelineDays}
                from={params.from ?? null}
            />
        </div>
    );
}
