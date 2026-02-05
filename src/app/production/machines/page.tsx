import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ReassignMachineButton } from '@/components/production/ReassignMachineButton';
import { ShiftManagerDialog } from '@/components/production/ShiftManagerDialog';
import { AssignJobButton } from '@/components/production/AssignJobButton';
import { MachineActions } from '@/components/production/MachineActions';
import { serializeData } from '@/lib/utils';
import { ProductionStatus } from '@prisma/client';
import {
    Machine,
    ProductionOrder,
    Employee,
    WorkShift,
    Bom,
    ProductVariant,
    Location,
    ProductionExecution,
    ProductionShift
} from '@prisma/client';

// Define more specific types for serialized data
type SerializedMachine = Machine & {
    location: Location | null;
    executions: (ProductionExecution & {
        productionOrder: (ProductionOrder & {
            bom: (Bom & { productVariant: ProductVariant });
            shifts: (ProductionShift & { operator: Employee | null; helpers: Employee[] })[];
        }) | null;
        operator: Employee | null;
    })[];
};

type SerializedProductionOrder = ProductionOrder & {
    bom: (Bom & { productVariant: ProductVariant });
    machine: Machine | null;
};

type SerializedEmployee = Employee;
type SerializedWorkShift = WorkShift;

export const dynamic = 'force-dynamic';

export default async function ProductionMachinesPage() {
    const machinesRaw = await prisma.machine.findMany({
        include: {
            executions: {
                where: { endTime: null },
                include: {
                    productionOrder: {
                        include: {
                            bom: { include: { productVariant: true } },
                            shifts: {
                                include: { operator: true, helpers: true },
                                orderBy: { startTime: 'desc' },
                                take: 1
                            }
                        }
                    },
                    operator: true
                }
            },
            location: true
        },
        orderBy: { code: 'asc' }
    });

    const releasedOrdersRaw = await prisma.productionOrder.findMany({
        where: { status: ProductionStatus.RELEASED },
        include: {
            bom: { include: { productVariant: true } },
            machine: true
        },
        orderBy: { plannedStartDate: 'asc' }
    });

    const employeesRaw = await prisma.employee.findMany({ orderBy: { name: 'asc' } });
    const workShiftsRaw = await prisma.workShift.findMany({ orderBy: { startTime: 'asc' } });

    // Serialize
    const machines = serializeData(machinesRaw) as SerializedMachine[];
    const releasedOrders = serializeData(releasedOrdersRaw) as SerializedProductionOrder[];
    const employees = serializeData(employeesRaw) as SerializedEmployee[];
    const workShifts = serializeData(workShiftsRaw) as SerializedWorkShift[];

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Machine Board</h2>
                <p className="text-muted-foreground">Live status of all production assets on the floor.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 mb-10">
                {machines.map((machine: SerializedMachine) => {
                    const activeExecution = machine.executions[0];
                    const activeOrder = activeExecution?.productionOrder;
                    const activeShift = activeOrder?.shifts?.[0];

                    return (
                        <Card key={machine.id} className={cn(
                            "group hover:shadow-xl transition-all border-l-4 relative overflow-hidden",
                            machine.status === 'ACTIVE' && activeExecution ? "border-l-emerald-500 bg-emerald-50/10 dark:bg-emerald-500/[0.02]" :
                                machine.status === 'ACTIVE' ? "border-l-zinc-300" : "border-l-rose-500 bg-rose-50/10"
                        )}>
                            <CardHeader className="pb-3 px-4">
                                <div className="flex justify-between items-start">
                                    <div className="flex flex-col">
                                        <CardTitle className="text-xl font-black tracking-tighter uppercase">{machine.code}</CardTitle>
                                        <CardDescription className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">{machine.name} • {machine.location?.name}</CardDescription>
                                    </div>
                                    <Badge variant={machine.status === 'ACTIVE' ? "outline" : "destructive"} className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0 h-4 shadow-none">
                                        {machine.status}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4 px-4 pb-4">
                                {activeExecution && activeOrder ? (
                                    <div className="space-y-3">
                                        <div className="p-3 rounded-lg bg-zinc-900 dark:bg-zinc-950 border border-zinc-800 shadow-inner">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-1.5 leading-none">
                                                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                                    <span className="text-[9px] uppercase font-black tracking-widest text-emerald-500">Live</span>
                                                </div>
                                                <span className="text-[10px] font-mono text-zinc-500 font-bold">#{activeOrder.orderNumber}</span>
                                            </div>
                                            <p className="text-xs font-black text-white truncate mb-1">
                                                {activeOrder.bom.productVariant.name}
                                            </p>

                                            {activeShift ? (
                                                <div className="flex items-center gap-2 mt-3 pt-2 border-t border-zinc-800">
                                                    <div className="h-6 w-6 rounded bg-zinc-800 flex items-center justify-center text-[10px] font-black text-zinc-400">
                                                        {activeShift.operator?.name?.charAt(0) || 'E'}
                                                    </div>
                                                    <div className="flex flex-col min-w-0">
                                                        <span className="text-[10px] font-black text-zinc-200 truncate leading-none uppercase tracking-tighter">
                                                            {activeShift.operator?.name || 'Unassigned'}
                                                        </span>
                                                        <span className="text-[8px] font-black text-zinc-600 uppercase mt-0.5">{activeShift.shiftName}</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="text-[9px] font-black text-rose-500 uppercase mt-2 italic flex items-center gap-1">
                                                    <div className="h-1 w-1 rounded-full bg-rose-500" />
                                                    Shift Assignment Needed
                                                </div>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-2 gap-2">
                                            <ShiftManagerDialog
                                                orderId={activeOrder.id}
                                                orderNumber={activeOrder.orderNumber}
                                                shifts={activeOrder.shifts || []}
                                                operators={employees}
                                                helpers={employees}
                                                workShifts={workShifts}
                                                machines={machines}
                                            />
                                            <ReassignMachineButton
                                                orderId={activeOrder.id}
                                                orderNumber={activeOrder.orderNumber}
                                                currentMachineId={machine.id}
                                                machines={machines}
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="h-32 flex flex-col items-center justify-center border-2 border-dashed rounded-lg bg-zinc-50 dark:bg-zinc-900/20 border-zinc-200 dark:border-zinc-800">
                                        <div className="p-2 rounded-full bg-zinc-100 dark:bg-zinc-800 mb-2">
                                            <Loader2 className="h-4 w-4 text-zinc-400 opacity-50" />
                                        </div>
                                        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest leading-none">Station Idle</span>
                                        <AssignJobButton
                                            machineId={machine.id}
                                            machineCode={machine.code}
                                            releasedOrders={releasedOrders}
                                        />
                                    </div>
                                )}

                                <div className="pt-2 flex items-center justify-between border-t border-zinc-100 dark:border-zinc-800">
                                    <MachineActions id={machine.id} name={machine.name} />
                                    <Link href={`/production/resources/machines/${machine.id}`}>
                                        <Button variant="ghost" size="sm" className="h-7 text-[10px] font-black uppercase tracking-wider text-muted-foreground hover:text-foreground">
                                            History
                                        </Button>
                                    </Link>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}
