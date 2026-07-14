'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { id as localeID } from 'date-fns/locale';
import { List } from 'lucide-react';
import { planningLabels } from '@/lib/labels/planning';
import type { OrderChip } from './MachineAllocationMatrix';

type UnassignedOrder = OrderChip & { machineId: string | null; plannedStartDate: string | Date };

interface PendingDispatchQueueProps {
    orders: UnassignedOrder[];
    machines: { id: string; code: string; type: string }[];
    onAssignClick: (orderId: string) => void;
}

export function PendingDispatchQueue({ orders, onAssignClick }: PendingDispatchQueueProps) {
    const unassigned = orders.filter(o => !o.machineId);

    return (
        <div className="w-full">
            <div className="flex items-center gap-2 mb-3">
                <List className="h-5 w-5 text-zinc-500 dark:text-zinc-400" />
                <span className="text-lg font-semibold">{planningLabels.pendingDispatchQueue}</span>
            </div>
            <div className="flex flex-wrap gap-3">
                {unassigned.map(order => (
                    <div key={order.id} className="w-[200px] p-3 rounded-lg border bg-muted/50 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{order.orderNumber}</span>
                            <Badge variant="outline" className="text-[9px] uppercase">{order.status}</Badge>
                        </div>
                        <div className="text-[11px] font-medium line-clamp-1">{order.bomName}</div>
                        <div className="flex items-center justify-between mt-auto pt-2 border-t">
                            <span className="text-[10px] text-muted-foreground">
                                {format(new Date(order.plannedStartDate), 'MMM dd', { locale: localeID })}
                            </span>
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-[10px] py-0 px-2 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:text-zinc-100 hover:bg-zinc-100 dark:bg-zinc-800"
                                onClick={() => onAssignClick(order.id)}
                            >
                                {planningLabels.assignMachine}
                            </Button>
                        </div>
                    </div>
                ))}
                {unassigned.length === 0 && (
                    <div className="w-full text-center py-8 text-sm text-muted-foreground italic">
                        {planningLabels.allAssigned}
                    </div>
                )}
            </div>
        </div>
    );
}
