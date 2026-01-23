import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ProductionStatus } from '@prisma/client';
import { format, startOfDay, addDays, isSameDay } from 'date-fns';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, List, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function PpicSchedulePage() {
    const machines = await prisma.machine.findMany({
        orderBy: { code: 'asc' }
    });

    const orders = await prisma.productionOrder.findMany({
        where: {
            status: { in: [ProductionStatus.RELEASED, ProductionStatus.IN_PROGRESS, ProductionStatus.DRAFT] }
        },
        include: {
            bom: true,
            machine: true
        },
        orderBy: { plannedStartDate: 'asc' }
    });

    // Simple 7-day lookahead for the "Timeline" view
    const today = startOfDay(new Date());
    const timelineDays = Array.from({ length: 7 }, (_, i) => addDays(today, i));

    return (
        <div className="p-4 md:p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Production Schedule</h1>
                    <p className="text-sm md:text-base text-muted-foreground">Manage and optimize machine allocations and production sequences.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" className="flex-1 sm:flex-none">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        Month View
                    </Button>
                    <Button className="bg-zinc-900 hover:bg-zinc-800 flex-1 sm:flex-none">
                        <Layers className="mr-2 h-4 w-4" />
                        Optimize Batches
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
                {/* Machine Schedule Matrix */}
                <Card className="overflow-hidden border-zinc-200">
                    <CardHeader className="bg-muted/30 border-b py-3 px-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <CardTitle className="text-base font-semibold">Machine Allocation Board</CardTitle>
                                <div className="flex gap-2">
                                    <Badge variant="outline" className="bg-white">Next 7 Days</Badge>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" className="h-8 w-8"><ChevronLeft className="h-4 w-4" /></Button>
                                <span className="text-sm font-medium px-2">{format(today, 'MMM dd')} - {format(timelineDays[6], 'MMM dd, yyyy')}</span>
                                <Button variant="ghost" size="icon" className="h-8 w-8"><ChevronRight className="h-4 w-4" /></Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr>
                                        <th className="sticky left-0 z-20 bg-muted border-b border-r p-3 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider w-48">
                                            Machine / Work Center
                                        </th>
                                        {timelineDays.map(day => (
                                            <th key={day.toISOString()} className="border-b border-r p-3 text-center min-w-[140px] bg-muted/30">
                                                <div className="text-xs font-semibold text-zinc-900">{format(day, 'EEE')}</div>
                                                <div className="text-lg font-bold text-foreground leading-none">{format(day, 'dd')}</div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {machines.map(machine => (
                                        <tr key={machine.id} className="group hover:bg-zinc-50/50">
                                            <td className="sticky left-0 z-10 bg-background group-hover:bg-muted/50 border-b border-r p-3">
                                                <div className="font-bold text-sm text-zinc-900">{machine.code}</div>
                                                <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-tighter">{machine.type}</div>
                                                <Badge variant="outline" className={cn(
                                                    "mt-1 text-[9px] px-1.5 py-0",
                                                    machine.status === 'ACTIVE' ? "text-emerald-600 bg-emerald-50 border-emerald-100" : "text-amber-600 bg-amber-50 border-amber-100"
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
                                                    <td key={`${machine.id}-${day.toISOString()}`} className="border-b border-r p-2 vertical-top h-24 relative">
                                                        <div className="space-y-1">
                                                            {dayOrders.map(order => (
                                                                <TooltipProvider key={order.id}>
                                                                    <Tooltip>
                                                                        <TooltipTrigger asChild>
                                                                            <div className={cn(
                                                                                "p-1.5 rounded text-[10px] leading-tight border transition-all cursor-pointer",
                                                                                order.status === 'IN_PROGRESS'
                                                                                    ? "bg-blue-50 border-blue-200 text-blue-700 font-medium"
                                                                                    : "bg-white border-zinc-200 text-zinc-600 shadow-sm hover:border-zinc-300"
                                                                            )}>
                                                                                <div className="truncate font-bold">{order.orderNumber}</div>
                                                                                <div className="truncate">{order.bom.name}</div>
                                                                            </div>
                                                                        </TooltipTrigger>
                                                                        <TooltipContent side="right" className="p-3 max-w-xs">
                                                                            <div className="space-y-1">
                                                                                <div className="text-xs font-bold">{order.orderNumber}</div>
                                                                                <div className="text-[11px]">{order.bom.name}</div>
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
                                                                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 rounded-full bg-zinc-100 text-zinc-400">+</Button>
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
                    </CardContent>
                </Card>

                {/* Unscheduled / Draft Orders */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg font-semibold flex items-center gap-2">
                            <List className="h-5 w-5 text-zinc-500" />
                            Pending Dispatch Queue
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-wrap gap-3">
                            {orders.filter(o => !o.machineId).map(order => (
                                <div key={order.id} className="w-[200px] p-3 rounded-lg border bg-muted/50 flex flex-col gap-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-zinc-700">{order.orderNumber}</span>
                                        <Badge variant="outline" className="text-[9px] uppercase">{order.status}</Badge>
                                    </div>
                                    <div className="text-[11px] font-medium line-clamp-1">{order.bom.name}</div>
                                    <div className="flex items-center justify-between mt-auto pt-2 border-t">
                                        <span className="text-[10px] text-muted-foreground">{format(new Date(order.plannedStartDate), 'MMM dd')}</span>
                                        <Button size="sm" variant="ghost" className="h-7 text-[10px] py-0 px-2 text-zinc-700 hover:text-zinc-900 hover:bg-zinc-100">
                                            Assign Machine
                                        </Button>
                                    </div>
                                </div>
                            ))}
                            {orders.filter(o => !o.machineId).length === 0 && (
                                <div className="w-full text-center py-8 text-sm text-muted-foreground italic">
                                    All active orders are currently assigned to machines.
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

