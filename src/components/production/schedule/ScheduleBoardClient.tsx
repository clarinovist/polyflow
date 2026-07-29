'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { planningLabels } from '@/lib/labels/planning';
import { WeekRangeNav } from './WeekRangeNav';
import { MachineAllocationMatrix } from './MachineAllocationMatrix';
import { PendingDispatchQueue } from './PendingDispatchQueue';
import { AssignOrderDialog } from './AssignOrderDialog';
import type { OrderChip, Machine } from './MachineAllocationMatrix';

/* ---------- Types ---------- */
export type ScheduleOrder = OrderChip & {
    plannedStartDate: string | Date;
};

interface ScheduleBoardClientProps {
    machines: Machine[];
    orders: ScheduleOrder[];
    timelineDays: Date[];
    from: string | null;
    showCompleted: boolean;
    counts: { ongoing: number; completedInWeek: number };
}

/* ---------- Component ---------- */
export function ScheduleBoardClient({
    machines,
    orders,
    timelineDays,
    from,
    showCompleted,
    counts,
}: ScheduleBoardClientProps) {
    const ongoingOnly = orders.filter((o) => o.status !== 'COMPLETED');
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
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                                <CardTitle className="text-base font-semibold">
                                    {planningLabels.machineAllocationBoard}
                                </CardTitle>
                                <span className="text-xs text-muted-foreground">
                                    {counts.ongoing} aktif
                                    {counts.completedInWeek > 0
                                        ? ` + ${counts.completedInWeek} selesai`
                                        : ''}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <WeekRangeNav from={from} />
                                {from ? (
                                    <Link
                                        href={`/production/schedule?from=${from}&showCompleted=${showCompleted ? '0' : '1'}`}
                                    >
                                        <Button variant="outline" size="sm">
                                            {showCompleted
                                                ? planningLabels.hideCompleted
                                                : planningLabels.showCompleted}
                                        </Button>
                                    </Link>
                                ) : (
                                    <Link
                                        href={`/production/schedule?showCompleted=${showCompleted ? '0' : '1'}`}
                                    >
                                        <Button variant="outline" size="sm">
                                            {showCompleted
                                                ? planningLabels.hideCompleted
                                                : planningLabels.showCompleted}
                                        </Button>
                                    </Link>
                                )}
                            </div>
                        </div>
                        {showCompleted && counts.completedInWeek > 0 && (
                            <div className="px-4 pb-2 text-[11px] text-muted-foreground">
                                {planningLabels.completedHistoryHint}
                            </div>
                        )}
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
                            orders={ongoingOnly}
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
