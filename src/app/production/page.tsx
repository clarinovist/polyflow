import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Factory, Send, Boxes, AlertTriangle, TrendingUp, CheckCircle2 } from 'lucide-react';
import { ProductionStatus, MachineStatus } from '@prisma/client';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default async function ProductionDashboard() {
    // 1. Fetch Stats
    const [machines, activeOrders, pendingOrders, completedToday] = await Promise.all([
        prisma.machine.findMany(),
        prisma.productionOrder.count({ where: { status: ProductionStatus.IN_PROGRESS } }),
        prisma.productionOrder.count({ where: { status: ProductionStatus.RELEASED } }),
        prisma.productionOrder.count({
            where: {
                status: ProductionStatus.COMPLETED,
                updatedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) }
            }
        }),
    ]);

    const onlineMachines = machines.filter(m => m.status === MachineStatus.ACTIVE).length;
    const alertMachines = machines.filter(m => m.status === MachineStatus.BROKEN || m.status === MachineStatus.MAINTENANCE).length;

    // 2. Fetch Floor Stock Summary (Mixing Area)
    const floorStock = await prisma.inventory.aggregate({
        where: { location: { slug: 'mixing_area' } },
        _sum: { quantity: true }
    });

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Floor Overview</h2>
                    <p className="text-muted-foreground">Tactical control for shift supervisors.</p>
                </div>
                <div className="flex items-center gap-3">
                    <Link href="/production/dispatch">
                        <Button className="bg-emerald-600 hover:bg-emerald-700">
                            <Send className="mr-2 h-4 w-4" />
                            Dispatch Orders
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Top Stats */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="border-emerald-100 dark:border-emerald-900/30">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Machine Status</CardTitle>
                        <Factory className="h-4 w-4 text-emerald-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{onlineMachines} / {machines.length}</div>
                        <p className="text-xs text-muted-foreground">Machines Operational</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Active Jobs</CardTitle>
                        <TrendingUp className="h-4 w-4 text-blue-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{activeOrders}</div>
                        <p className="text-xs text-muted-foreground">Currently on machines</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Wait for Dispatch</CardTitle>
                        <Send className="h-4 w-4 text-amber-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{pendingOrders}</div>
                        <p className="text-xs text-muted-foreground">Released from PPIC</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Completed Today</CardTitle>
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{completedToday}</div>
                        <p className="text-xs text-muted-foreground">Shift performance</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
                {/* Floor Critical Alerts */}
                <Card className="lg:col-span-3">
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-red-500" />
                            System Alerts
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {alertMachines > 0 ? (
                            <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30">
                                <AlertTriangle className="h-4 w-4 text-red-600" />
                                <div className="text-sm text-red-700 dark:text-red-400">
                                    <span className="font-bold">{alertMachines} Machines</span> need attention or maintenance.
                                </div>
                            </div>
                        ) : (
                            <div className="text-sm text-slate-500 italic">No machine alerts at this time.</div>
                        )}

                        {pendingOrders > 5 && (
                            <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30">
                                <Send className="h-4 w-4 text-amber-600" />
                                <div className="text-sm text-amber-700 dark:text-amber-400">
                                    Queue bottleneck: <span className="font-bold">{pendingOrders} orders</span> waiting for dispatch.
                                </div>
                            </div>
                        )}

                        <div className="h-[200px] flex items-center justify-center border-2 border-dashed rounded-lg bg-slate-50 dark:bg-slate-900/50">
                            <div className="text-center">
                                <p className="text-xs text-muted-foreground italic">Floor Stock Level (Mixing Area)</p>
                                <p className="text-2xl font-bold mt-1">{(floorStock._sum.quantity || 0).toLocaleString()} KG</p>
                                <Link href="/production/inventory">
                                    <Button variant="link" size="sm" className="text-emerald-600">View details</Button>
                                </Link>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Quick Shortcuts Grid */}
                <div className="lg:col-span-4 grid grid-cols-2 gap-4">
                    <ShortcutCard
                        title="Machine Control"
                        description="Start/Stop & Log Efficiency"
                        href="/production/machines"
                        icon={Factory}
                        color="bg-emerald-500"
                    />
                    <ShortcutCard
                        title="Job Dispatch"
                        description="Assign jobs to machines"
                        href="/production/dispatch"
                        icon={Send}
                        color="bg-blue-500"
                    />
                    <ShortcutCard
                        title="Material Handover"
                        description="Receive raw materials"
                        href="/production/inventory"
                        icon={Boxes}
                        color="bg-purple-500"
                    />
                    <ShortcutCard
                        title="Quality Control"
                        description="Inspect finished goods"
                        href="/dashboard/production/orders"
                        icon={CheckCircle2}
                        color="bg-slate-500"
                    />
                </div>
            </div>
        </div>
    );
}

function ShortcutCard({ title, description, href, icon: Icon, color }: { title: string, description: string, href: string, icon: React.ElementType, color: string }) {
    return (
        <Link href={href} className="group block">
            <Card className="h-full hover:border-emerald-500/50 hover:shadow-md transition-all duration-300">
                <CardContent className="p-6 flex flex-col items-center text-center justify-center">
                    <div className={`${color} p-4 rounded-2xl text-white mb-4 shadow-lg group-hover:scale-110 transition-transform`}>
                        <Icon size={24} />
                    </div>
                    <h3 className="font-bold text-lg">{title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{description}</p>
                </CardContent>
            </Card>
        </Link>
    )
}
