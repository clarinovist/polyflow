import { getMachines } from '@/actions/production/machines';
import { getProductionOrders } from '@/actions/production/production-orders';
import { getEmployees } from '@/actions/admin/employees';
import { getWorkShifts } from '@/actions/admin/work-shifts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, PauseCircle } from 'lucide-react';
import { cn } from '@/lib/utils/utils';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ReassignMachineButton } from '@/components/production/ReassignMachineButton';
import { ShiftManagerDialog } from '@/components/production/ShiftManagerDialog';
import { AssignJobButton } from '@/components/production/AssignJobButton';
import { MachineActions } from '@/components/production/MachineActions';
import { serializeData } from '@/lib/utils/utils';
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
    shifts: (ProductionShift & { operator: Employee | null; helpers: Employee[] })[];
};

type SerializedEmployee = Employee;
type SerializedWorkShift = WorkShift;

export const dynamic = 'force-dynamic';

export default async function ProductionMachinesPage() {
    const machinesRes = await getMachines();
    const machinesRaw = machinesRes.success && machinesRes.data ? machinesRes.data : [];

    const ordersRes = await getProductionOrders();
    const allOrders = ordersRes;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const releasedOrdersRaw = (allOrders as any[]).filter((o: any) => o.status === ProductionStatus.RELEASED);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inProgressOrdersRaw = (allOrders as any[]).filter((o: any) => o.status === ProductionStatus.IN_PROGRESS);

    const employeesRes = await getEmployees();
    const employeesRaw = employeesRes.success && employeesRes.data ? employeesRes.data : [];

    const workShiftsRes = await getWorkShifts();
    const workShiftsRaw = workShiftsRes.success && workShiftsRes.data ? workShiftsRes.data : [];

    // Serialize
    const machines = serializeData(machinesRaw) as unknown as SerializedMachine[];
    const releasedOrders = serializeData(releasedOrdersRaw) as SerializedProductionOrder[];
    const inProgressOrders = serializeData(inProgressOrdersRaw) as SerializedProductionOrder[];
    const employees = serializeData(employeesRaw) as unknown as SerializedEmployee[];
    const workShifts = serializeData(workShiftsRaw) as unknown as SerializedWorkShift[];

    // Build a map: machineId → IN_PROGRESS orders assigned to that machine
    const ordersByMachine = new Map<string, SerializedProductionOrder[]>();
    for (const order of inProgressOrders) {
        const mid = order.machine?.id;
        if (mid) {
            const existing = ordersByMachine.get(mid) || [];
            existing.push(order);
            ordersByMachine.set(mid, existing);
        }
    }

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

                    // Fallback: check if there's an IN_PROGRESS order assigned to this machine
                    // but without an active execution (execution completed or missing)
                    const assignedOrders = ordersByMachine.get(machine.id) || [];
                    const assignedOrder = !activeExecution ? assignedOrders[0] : null;
                    const assignedShift = assignedOrder?.shifts?.[0];

                    return (
                        <Card key={machine.id} className={cn(
                            "group hover:shadow-xl transition-all border-l-4 relative overflow-hidden",
                            machine.status === 'ACTIVE' && activeExecution ? "border-l-emerald-500 bg-emerald-50/10 dark:bg-emerald-900/10" :
                                machine.status === 'ACTIVE' && assignedOrder ? "border-l-amber-500 bg-amber-50/10 dark:bg-amber-900/10" :
                                    machine.status === 'ACTIVE' ? "border-l-zinc-300 dark:border-l-zinc-600" : "border-l-rose-500 dark:border-l-rose-400 bg-rose-50/10 dark:bg-rose-900/10"
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
                                    /* Case 1: Active execution running */
                                    <div className="space-y-3">
                                        <div className="p-3 rounded-lg bg-zinc-900 dark:bg-zinc-950 border border-zinc-800 shadow-inner">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-1.5 leading-none">
                                                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                                    <span className="text-[9px] uppercase font-black tracking-widest text-emerald-500 dark:text-emerald-400">Live</span>
                                                </div>
                                                <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 font-bold">#{activeOrder.orderNumber}</span>
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
                                                        <span className="text-[10px] font-black text-zinc-200 dark:text-zinc-300 truncate leading-none uppercase tracking-tighter">
                                                            {activeShift.operator?.name || 'Unassigned'}
                                                        </span>
                                                        <span className="text-[8px] font-black text-zinc-600 dark:text-zinc-400 uppercase mt-0.5">{activeShift.shiftName}</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="text-[9px] font-black text-rose-500 dark:text-rose-400 uppercase mt-2 italic flex items-center gap-1">
                                                    <div className="h-1 w-1 rounded-full bg-rose-500 dark:bg-rose-400" />
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
                                ) : assignedOrder ? (
                                    /* Case 2: Order assigned but no active execution */
                                    <div className="space-y-3">
                                        <div className="p-3 rounded-lg bg-amber-950/50 dark:bg-amber-950/30 border border-amber-800/50 shadow-inner">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-1.5 leading-none">
                                                    <PauseCircle className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />
                                                    <span className="text-[9px] uppercase font-black tracking-widest text-amber-500 dark:text-amber-400">Paused</span>
                                                </div>
                                                <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 font-bold">#{assignedOrder.orderNumber}</span>
                                            </div>
                                            <p className="text-xs font-black text-white truncate mb-1">
                                                {assignedOrder.bom.productVariant.name}
                                            </p>
                                            <p className="text-[9px] text-amber-400/80 mt-1">
                                                Order aktif — eksekusi belum dimulai atau sudah selesai
                                            </p>

                                            {assignedShift ? (
                                                <div className="flex items-center gap-2 mt-3 pt-2 border-t border-amber-800/50">
                                                    <div className="h-6 w-6 rounded bg-zinc-800 flex items-center justify-center text-[10px] font-black text-zinc-400">
                                                        {assignedShift.operator?.name?.charAt(0) || 'E'}
                                                    </div>
                                                    <div className="flex flex-col min-w-0">
                                                        <span className="text-[10px] font-black text-zinc-200 dark:text-zinc-300 truncate leading-none uppercase tracking-tighter">
                                                            {assignedShift.operator?.name || 'Unassigned'}
                                                        </span>
                                                        <span className="text-[8px] font-black text-zinc-600 dark:text-zinc-400 uppercase mt-0.5">{assignedShift.shiftName}</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="text-[9px] font-black text-rose-500 dark:text-rose-400 uppercase mt-2 italic flex items-center gap-1">
                                                    <div className="h-1 w-1 rounded-full bg-rose-500 dark:bg-rose-400" />
                                                    Shift Assignment Needed
                                                </div>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-2 gap-2">
                                            <ShiftManagerDialog
                                                orderId={assignedOrder.id}
                                                orderNumber={assignedOrder.orderNumber}
                                                shifts={assignedOrder.shifts || []}
                                                operators={employees}
                                                helpers={employees}
                                                workShifts={workShifts}
                                                machines={machines}
                                            />
                                            <ReassignMachineButton
                                                orderId={assignedOrder.id}
                                                orderNumber={assignedOrder.orderNumber}
                                                currentMachineId={machine.id}
                                                machines={machines}
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    /* Case 3: Station idle */
                                    <div className="h-32 flex flex-col items-center justify-center border-2 border-dashed rounded-lg bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700">
                                        <div className="p-2 rounded-full bg-zinc-100 dark:bg-zinc-800 mb-2">
                                            <Loader2 className="h-4 w-4 text-zinc-400 opacity-50" />
                                        </div>
                                        <span className="text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest leading-none">Station Idle</span>
                                        <AssignJobButton
                                            machineId={machine.id}
                                            machineCode={machine.code}
                                            releasedOrders={releasedOrders}
                                        />
                                    </div>
                                )}

                                <div className="pt-2 flex items-center justify-between border-t border-zinc-100 dark:border-zinc-800">
                                    <MachineActions id={machine.id} name={machine.name} />
                                    <Link href={`/production/machines/${machine.id}`}>
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
