'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { List, AlertTriangle } from 'lucide-react';
import { planningLabels } from '@/lib/labels/planning';
import { formatWibDate, toBusinessDateString } from '@/lib/utils/timezone';
import { cn } from '@/lib/utils/utils';
import type { OrderChip } from './MachineAllocationMatrix';

type UnassignedOrder = OrderChip & { plannedStartDate: string | Date };

interface PendingDispatchQueueProps {
    orders: UnassignedOrder[];
    onAssignClick: (orderId: string) => void;
}

export function PendingDispatchQueue({ orders, onAssignClick }: PendingDispatchQueueProps) {
    const todayStr = toBusinessDateString(new Date());

    const unassigned = orders
        .filter(o => !o.machineId && ['RELEASED', 'DRAFT', 'WAITING_MATERIAL'].includes(o.status))
        .sort((a, b) => {
            const dateA = new Date(a.plannedStartDate).getTime();
            const dateB = new Date(b.plannedStartDate).getTime();
            if (dateA !== dateB) {
                return dateA - dateB;
            }
            const statusOrder: Record<string, number> = {
                RELEASED: 1,
                WAITING_MATERIAL: 2,
                DRAFT: 3,
            };
            const valA = statusOrder[a.status] ?? 99;
            const valB = statusOrder[b.status] ?? 99;
            return valA - valB;
        });

    return (
        <div className="w-full">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-2 border-b">
                <div className="flex items-center gap-2">
                    <List className="h-5 w-5 text-zinc-500 dark:text-zinc-400" />
                    <span className="text-lg font-semibold">{planningLabels.pendingDispatchQueue}</span>
                    <Badge variant="secondary" className="ml-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                        {unassigned.length} WO belum dialokasikan
                    </Badge>
                </div>
            </div>
            <div className="flex flex-wrap gap-3">
                {unassigned.map(order => {
                    const orderDateStr = toBusinessDateString(order.plannedStartDate);
                    const isOverdue = orderDateStr < todayStr;

                    return (
                        <div key={order.id} className="w-[220px] p-3 rounded-lg border bg-muted/50 flex flex-col gap-2 relative group hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors">
                            <div className="flex items-center justify-between gap-1">
                                <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 truncate">{order.orderNumber}</span>
                                <Badge variant="outline" className="text-[9px] uppercase shrink-0">{order.status}</Badge>
                            </div>
                            <div className="text-[11px] font-medium line-clamp-1 text-zinc-800 dark:text-zinc-200">{order.bomName}</div>
                            
                            {isOverdue && (
                                <div className="flex items-center gap-1 text-[10px] text-destructive font-medium mt-1">
                                    <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
                                    <span>Lewat Tempo</span>
                                </div>
                            )}

                            <div className="flex items-center justify-between mt-auto pt-2 border-t">
                                <span className={cn("text-[10px]", isOverdue ? "text-destructive font-semibold" : "text-muted-foreground")}>
                                    {formatWibDate(order.plannedStartDate, 'dd MMM')}
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
                    );
                })}
                {unassigned.length === 0 && (
                    <div className="w-full text-center py-8 text-sm text-muted-foreground italic">
                        {planningLabels.allAssigned}
                    </div>
                )}
            </div>
        </div>
    );
}
