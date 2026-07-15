'use client';

import Link from 'next/link';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/utils';
import { format } from 'date-fns';
import { id as localeID } from 'date-fns/locale';
import { planningLabels } from '@/lib/labels/planning';
import { toBusinessDateString } from '@/lib/utils/timezone';
import { AlertTriangle, Plus, Info } from 'lucide-react';

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
    const hasAnyAllocation = orders.some(o => 
        o.machineId && timelineDays.some(d => toBusinessDateString(o.plannedStartDate) === toBusinessDateString(d))
    );

    return (
        <div className="space-y-4">
            {/* Empty State Banner */}
            {!hasAnyAllocation && (
                <div className="mx-4 mt-4 p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30 flex items-start gap-3">
                    <Info className="h-5 w-5 text-zinc-500 shrink-0 mt-0.5" />
                    <div>
                        <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Belum Ada Alokasi Jadwal</h4>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                            Tidak ada order produksi yang dijadwalkan pada mesin untuk minggu ini. Klik tombol <span className="font-semibold text-zinc-700 dark:text-zinc-300">&quot;+ Alokasi&quot;</span> pada sel mesin/tanggal, atau pilih dari <span className="font-semibold text-zinc-700 dark:text-zinc-300">Antrian Dispatch</span> di bawah untuk mulai mengalokasikan.
                        </p>
                    </div>
                </div>
            )}

            <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                    <thead>
                        <tr>
                            <th className="sticky left-0 z-20 bg-muted border-b border-r p-3 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider w-48">
                                {planningLabels.machineWorkCenter}
                            </th>
                            {timelineDays.map(day => (
                                <th key={day.toISOString()} className="border-b border-r p-3 text-center min-w-[150px] bg-muted/30">
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
                                    const targetDayStr = toBusinessDateString(day);
                                    const dayOrders = orders.filter(o =>
                                        o.machineId === machine.id &&
                                        toBusinessDateString(o.plannedStartDate) === targetDayStr
                                    );

                                    const isConflicted = dayOrders.length > 1;

                                    return (
                                        <td key={`${machine.id}-${day.toISOString()}`} className="border-b border-r p-2 align-top min-h-24 h-24 relative group/cell">
                                            {dayOrders.length === 0 ? (
                                                <div 
                                                    className="h-full min-h-[4rem] flex flex-col items-center justify-center border border-dashed border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-100/30 dark:hover:bg-zinc-800/20 rounded transition-all cursor-pointer p-2"
                                                    onClick={() => onAssignClick(machine.id, day)}
                                                >
                                                    <Plus className="h-4 w-4 text-zinc-300 dark:text-zinc-600 group-hover/cell:text-zinc-500 mb-0.5" />
                                                    <span className="text-[10px] text-zinc-300 dark:text-zinc-600 group-hover/cell:text-zinc-500 font-medium">Alokasi</span>
                                                </div>
                                            ) : (
                                                <div className="space-y-1 h-full flex flex-col">
                                                    <div className="space-y-1 overflow-y-auto max-h-[120px] flex-1 pr-0.5">
                                                        {dayOrders.map(order => (
                                                            <TooltipProvider key={order.id}>
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <Link href={`/production/orders/${order.id}`}>
                                                                            <div className={cn(
                                                                                "p-2 rounded text-[10px] leading-tight border transition-all cursor-pointer shadow-sm flex flex-col gap-0.5",
                                                                                order.status === 'IN_PROGRESS'
                                                                                    ? "bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800 text-blue-800 dark:text-blue-300 font-medium ring-1 ring-blue-400/10"
                                                                                    : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700"
                                                                            )}>
                                                                                <div className="flex items-center justify-between gap-1">
                                                                                    <span className="font-bold truncate">{order.orderNumber}</span>
                                                                                    {order.status === 'IN_PROGRESS' && (
                                                                                        <span className="flex h-1.5 w-1.5 rounded-full bg-blue-600 dark:bg-blue-400 animate-pulse shrink-0" />
                                                                                    )}
                                                                                </div>
                                                                                <div className="truncate text-zinc-600 dark:text-zinc-400">{order.bomName}</div>
                                                                                <div className="flex items-center justify-between text-[9px] mt-1 pt-1 border-t border-zinc-100 dark:border-zinc-800/80">
                                                                                    <span className="text-zinc-400">Qty: {Number(order.plannedQuantity).toLocaleString()}</span>
                                                                                    <span className="uppercase font-semibold scale-90 origin-right shrink-0">{order.status}</span>
                                                                                </div>
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
                                                    </div>

                                                    {/* Conflict Indicator inside cell */}
                                                    {isConflicted && (
                                                        <TooltipProvider>
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <div className="flex items-center gap-1 p-1 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-amber-700 dark:text-amber-400 text-[9px] font-semibold mt-1 cursor-help shrink-0">
                                                                        <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                                                                        <span className="truncate">Konflik ({dayOrders.length} WO)</span>
                                                                    </div>
                                                                </TooltipTrigger>
                                                                <TooltipContent side="bottom" className="p-2 text-xs">
                                                                    Ada lebih dari satu alokasi pekerjaan di mesin ini pada hari yang sama.
                                                                </TooltipContent>
                                                            </Tooltip>
                                                        </TooltipProvider>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
