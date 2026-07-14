'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { planningLabels } from '@/lib/labels/planning';
import { WeekRangeNav } from './WeekRangeNav';
import { MachineAllocationMatrix } from './MachineAllocationMatrix';
import { PendingDispatchQueue } from './PendingDispatchQueue';
import { AssignOrderDialog } from './AssignOrderDialog';
import type { OrderChip, Machine } from './MachineAllocationMatrix';

/* ---------- Types ---------- */
export type ScheduleOrder = OrderChip & {
    machineId: string | null;
    plannedStartDate: string | Date;
};

interface ScheduleBoardClientProps {
    machines: Machine[];
    orders: ScheduleOrder[];
    timelineDays: Date[];
    from: string | null;
}

/* ---------- Component ---------- */
export function ScheduleBoardClient({
    machines,
    orders,
    timelineDays,
    from,
}: ScheduleBoardClientProps) {
    const [assignDialogOpen, setAssignDialogOpen] = useState(false);
    const [assignContext, setAssignContext] = useState<{
        orderId?: string;
        machineId?: string;
        plannedStartDate?: Date;
    }>({});

    const handleAssignFromCell = (machineId: string, day: Date) => {
        setAssignContext({ machineId, plannedStartDate: day });
        setAssignDialogOpen(true);
    };

    const handleAssignFromQueue = (orderId: string) => {
        setAssignContext({ orderId });
        setAssignDialogOpen(true);
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6">
                {/* Machine Allocation Matrix */}
                <Card className="overflow-hidden border-zinc-200 dark:border-zinc-700">
                    <CardHeader className="bg-muted/30 border-b py-3 px-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <CardTitle className="text-base font-semibold">{planningLabels.machineAllocationBoard}</CardTitle>
                            </div>
                            <WeekRangeNav from={from} />
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <MachineAllocationMatrix
                            machines={machines}
                            orders={orders}
                            timelineDays={timelineDays}
                            onAssignClick={handleAssignFromCell}
                        />
                    </CardContent>
                </Card>

                {/* Pending Dispatch Queue */}
                <Card>
                    <CardContent className="pt-6">
                        <PendingDispatchQueue
                            orders={orders}
                            machines={machines}
                            onAssignClick={handleAssignFromQueue}
                        />
                    </CardContent>
                </Card>
            </div>

            {/* Assign Order Dialog */}
            <AssignOrderDialog
                open={assignDialogOpen}
                onOpenChange={setAssignDialogOpen}
                orderId={assignContext.orderId}
                machineId={assignContext.machineId}
                plannedStartDate={assignContext.plannedStartDate}
                orders={orders}
                machines={machines}
            />
        </div>
    );
}
