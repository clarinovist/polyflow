import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Factory, Send, Boxes, AlertTriangle, TrendingUp, CheckCircle2 } from 'lucide-react';
import { ProductionStatus, MachineStatus } from '@prisma/client';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';

export default async function ProductionDashboard() {
    const t = await getTranslations('production.dashboard');
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
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">{t('title')}</h2>
                    <p className="text-muted-foreground">{t('subtitle')}</p>
                </div>
                <div className="flex items-center gap-3">
                    <Link href="/production/dispatch">
                        <Button className="bg-emerald-600 hover:bg-emerald-700">
                            <Send className="mr-2 h-4 w-4" />
                            {t('dispatchOrders')}
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Top Stats */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="border-emerald-100 dark:border-emerald-900/30">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">{t('machineStatus')}</CardTitle>
                        <Factory className="h-4 w-4 text-emerald-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{onlineMachines} / {machines.length}</div>
                        <p className="text-xs text-muted-foreground">{t('machinesOperational')}</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">{t('activeJobs')}</CardTitle>
                        <TrendingUp className="h-4 w-4 text-blue-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{activeOrders}</div>
                        <p className="text-xs text-muted-foreground">{t('onMachines')}</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">{t('waitForDispatch')}</CardTitle>
                        <Send className="h-4 w-4 text-amber-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{pendingOrders}</div>
                        <p className="text-xs text-muted-foreground">{t('releasedFromPpic')}</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">{t('completedToday')}</CardTitle>
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{completedToday}</div>
                        <p className="text-xs text-muted-foreground">{t('shiftPerformance')}</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
                {/* Floor Critical Alerts */}
                <Card className="lg:col-span-3">
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-red-500" />
                            {t('systemAlerts')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {alertMachines > 0 ? (
                            <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30">
                                <AlertTriangle className="h-4 w-4 text-red-600" />
                                <div className="text-sm text-red-700 dark:text-red-400">
                                    {t('machinesNeedAttention', { count: alertMachines })}
                                </div>
                            </div>
                        ) : (
                            <div className="text-sm text-slate-500 italic">{t('noMachineAlerts')}</div>
                        )}

                        {pendingOrders > 5 && (
                            <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30">
                                <Send className="h-4 w-4 text-amber-600" />
                                <div className="text-sm text-amber-700 dark:text-amber-400">
                                    {t('queueBottleneck')} <span className="font-bold">{t('ordersWaitingDispatch', { count: pendingOrders })}</span>
                                </div>
                            </div>
                        )}

                        <div className="h-[200px] flex items-center justify-center border-2 border-dashed rounded-lg bg-slate-50 dark:bg-slate-900/50">
                            <div className="text-center">
                                <p className="text-xs text-muted-foreground italic">{t('floorStockLevel')}</p>
                                <p className="text-2xl font-bold mt-1">{(floorStock._sum.quantity || 0).toLocaleString()} KG</p>
                                <Link href="/production/inventory">
                                    <Button variant="link" size="sm" className="text-emerald-600">{t('viewDetails')}</Button>
                                </Link>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Quick Shortcuts Grid */}
                <div className="lg:col-span-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <ShortcutCard
                        title={t('machineControl')}
                        description={t('machineControlDesc')}
                        href="/production/machines"
                        icon={Factory}
                        color="bg-emerald-500"
                    />
                    <ShortcutCard
                        title={t('jobDispatch')}
                        description={t('jobDispatchDesc')}
                        href="/production/dispatch"
                        icon={Send}
                        color="bg-blue-500"
                    />
                    <ShortcutCard
                        title={t('materialHandover')}
                        description={t('materialHandoverDesc')}
                        href="/production/inventory"
                        icon={Boxes}
                        color="bg-purple-500"
                    />
                    <ShortcutCard
                        title={t('qualityControl')}
                        description={t('qualityControlDesc')}
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
