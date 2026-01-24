import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Factory, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { MachineActions } from '@/components/production/MachineActions';

export const dynamic = 'force-dynamic';

export default async function ProductionMachinesPage() {
    const machines = await prisma.machine.findMany({
        include: {
            executions: {
                where: { endTime: null }, // Current active executions
                include: {
                    productionOrder: {
                        include: {
                            bom: {
                                include: { productVariant: true }
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

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Machine Board</h2>
                <p className="text-muted-foreground">Live status of all production assets on the floor.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {machines.map((machine) => {
                    const activeExecution = machine.executions[0];

                    return (
                        <Card key={machine.id} className={cn(
                            "group hover:shadow-lg transition-all border-l-4",
                            machine.status === 'ACTIVE' && activeExecution ? "border-l-emerald-500" :
                                machine.status === 'ACTIVE' ? "border-l-slate-300" : "border-l-red-500"
                        )}>
                            <CardHeader className="pb-3">
                                <div className="flex justify-between items-start">
                                    <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800">
                                        <Factory size={20} className={cn(
                                            machine.status === 'ACTIVE' ? "text-emerald-600" : "text-red-500"
                                        )} />
                                    </div>
                                    <Badge variant={machine.status === 'ACTIVE' ? "outline" : "destructive"}>
                                        {machine.status}
                                    </Badge>
                                </div>
                                <div className="mt-3">
                                    <CardTitle className="text-lg">{machine.name}</CardTitle>
                                    <CardDescription className="text-xs font-mono">{machine.code} • {machine.location.name}</CardDescription>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {activeExecution ? (
                                    <div className="p-3 rounded-md bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/30">
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                            <span className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400">Running Job</span>
                                        </div>
                                        <p className="text-sm font-bold truncate">
                                            {activeExecution.productionOrder.orderNumber}
                                        </p>
                                        <p className="text-xs text-muted-foreground truncate">
                                            {activeExecution.productionOrder.bom.productVariant.name}
                                        </p>
                                        <div className="mt-3 flex items-center justify-between">
                                            <span className="text-[10px] text-muted-foreground">Operator:</span>
                                            <span className="text-xs font-medium">{activeExecution.operator?.name || 'Unknown'}</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="h-24 flex flex-col items-center justify-center border-2 border-dashed rounded-md bg-slate-50 dark:bg-slate-900/50">
                                        <Loader2 className="h-5 w-5 text-muted-foreground/30 mb-2" />
                                        <span className="text-xs text-muted-foreground italic">Idle / Waiting for SPK</span>
                                    </div>
                                )}

                                <div className="pt-2 flex items-center gap-2">
                                    <MachineActions id={machine.id} name={machine.name} />
                                    <Link href={`/dashboard/production/resources/machines/${machine.id}`}>
                                        <Button variant="ghost" size="sm" className="h-8 text-xs">
                                            View
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
