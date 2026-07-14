'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/utils';
import { format, isSameDay } from 'date-fns';
import { id as localeID } from 'date-fns/locale';
import { planningLabels } from '@/lib/labels/planning';

/* ---------- Types ---------- */
export type OrderChip = {
    id: string;
    orderNumber: string;
    bomName: string;
    status: string;
    plannedQuantity: number;
    machineId: string | null;
};

export type Machine = {
    id: string;
    code: string;
    type: string;
    status: string;
};

/* ---------- Props ---------- */
interface MachineAllocationMatrixProps {
    machines: Machine[];
    orders: Array<OrderChip & { machineId: string | null; plannedStartDate: string | Date }>;
    timelineDays: Date[];
    onAssignClick: (machineId: string, day: Date) => void;
}

/* ---------- Component ---------- */
export function MachineAllocationMatrix({
    machines,
    orders,
    timelineDays,
    onAssignClick,
}: MachineAllocationMatrixProps) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full border-collapse">
                <thead>
                    <tr>
                        <th className="sticky left-0 z-20 bg-muted border-b border-r p-3 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider w-48">
                            {planningLabels.machineWorkCenter}
                        </th>
                        {timelineDays.map(day => (
                            <th key={day.toISOString()} className="border-b border-r p-3 text-center min-w-[140px] bg-muted/30">
                                <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                                    {format(day, 'EEE', { locale: localeID })}
                                </div>
                                <div className="text-lg font-bold text-foreground leading-none">
                                    {format(day, 'dd')}
                                </div>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {machines.map(machine => (
                        <tr key={machine.id} className="group hover:bg-zinc-50/50">
                            <td className="sticky left-0 z-10 bg-background group-hover:bg-muted/50 border-b border-r p-3">
                                <div className="font-bold text-sm text-zinc-900 dark:text-zinc-100">{machine.code}</div>
                                <div className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-tighter">{machine.type}</div>
                                <Badge variant="outline" className={cn(
                                    "mt-1 text-[9px] px-1.5 py-0",
                                    machine.status === 'ACTIVE'
                                        ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800/50"
                                        : "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800/50"
                                )}>
                                    {machine.status}
                                </Badge>
                            </td>
                            {timelineDays.map(day => {
                                const dayOrders = orders.filter(o =>
                                    o.machineId === machine.id &&
                                    isSameDay(new Date(o.plannedStartDate), day)
                                );

                                return (
                                    <td key={`${machine.id}-${day.toISOString()}`} className="border-b border-r p-2 align-top h-24 relative">
                                        <div className="space-y-1">
                                            {dayOrders.map(order => (
                                                <TooltipProvider key={order.id}>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Link href={`/production/orders/${order.id}`}>
                                                                <div className={cn(
                                                                    "p-1.5 rounded text-[10px] leading-tight border transition-all cursor-pointer",
                                                                    order.status === 'IN_PROGRESS'
                                                                        ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/50 text-blue-700 dark:text-blue-400 font-medium"
                                                                        : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 shadow-sm hover:border-zinc-300 dark:border-zinc-600"
                                                                )}>
                                                                    <div className="truncate font-bold">{order.orderNumber}</div>
                                                                    <div className="truncate">{order.bomName}</div>
                                                                </div>
                                                            </Link>
                                                        </TooltipTrigger>
                                                        <TooltipContent side="right" className="p-3 max-w-xs">
                                                            <div className="space-y-1">
                                                                <div className="text-xs font-bold">{order.orderNumber}</div>
                                                                <div className="text-[11px]">{order.bomName}</div>
                                                                <div className="flex justify-between text-[10px] pt-1 border-t">
                                                                    <span className="text-muted-foreground">Qty:</span>
                                                                    <span className="font-medium">{Number(order.plannedQuantity).toLocaleString()}</span>
                                                                </div>
                                                                <div className="flex justify-between text-[10px]">
                                                                    <span className="text-muted-foreground">Status:</span>
                                                                    <span className="font-medium">{order.status}</span>
                                                                </div>
                                                            </div>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            ))}
                                            {dayOrders.length === 0 && (
                                                <div className="h-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-6 w-6 p-0 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500"
                                                        onClick={() => onAssignClick(machine.id, day)}
                                                        aria-label={`${planningLabels.assignOrder} ${machine.code} ${format(day, 'dd MMM', { locale: localeID })}`}
                                                    >
                                                        +
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
