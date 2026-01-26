import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Send, Clock, Factory, User, ChevronRight } from 'lucide-react';
import { ProductionStatus } from '@prisma/client';
import { format } from 'date-fns';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { getTranslations } from 'next-intl/server';
import ReassignMachineButton from '@/components/production/ReassignMachineButton';
import { ShiftManager } from '@/components/production/ShiftManager';

export const dynamic = 'force-dynamic';

export default async function ProductionDispatchPage() {
    const t = await getTranslations('production.dispatch');
    // Fetch Released or In Progress orders (include shifts)
    const orders = await prisma.productionOrder.findMany({
        where: {
            status: { in: [ProductionStatus.RELEASED, ProductionStatus.IN_PROGRESS] }
        },
        include: {
            bom: {
                include: { productVariant: true }
            },
            machine: true,
            location: true,
            executions: {
                where: { endTime: null },
                include: { operator: true }
            },
            shifts: {
                include: { operator: true, helpers: true },
                orderBy: { startTime: 'asc' }
            }
        },
        orderBy: { plannedStartDate: 'asc' }
    });

    // Fetch supporting resources for client components
    const machines = await prisma.machine.findMany({ include: { location: true }, orderBy: { code: 'asc' } });
    const employees = await prisma.employee.findMany({ orderBy: { name: 'asc' } });
    const workShifts = await prisma.workShift.findMany({ orderBy: { startTime: 'asc' } });

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">{t('title')}</h2>
                    <p className="text-muted-foreground">{t('subtitle')}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Orders List */}
                <div className="lg:col-span-3 space-y-4">
                    {orders.length === 0 ? (
                        <Card className="border-dashed flex items-center justify-center p-12 h-64">
                            <div className="text-center text-muted-foreground">
                                <Send className="h-10 w-10 mx-auto mb-4 opacity-20" />
                                <p>{t('noOrders')}</p>
                            </div>
                        </Card>
                    ) : (
                        orders.map((order) => {
                            const progress = order.actualQuantity && order.plannedQuantity
                                ? (Number(order.actualQuantity) / Number(order.plannedQuantity)) * 100
                                : 0;

                            return (
                                <Card key={order.id} className="overflow-hidden hover:border-emerald-300 transition-colors">
                                    <div className="flex h-full">
                                        <div className={cn(
                                            "w-2",
                                            order.status === 'IN_PROGRESS' ? "bg-blue-500" : "bg-amber-500"
                                        )} />
                                        <CardContent className="flex-1 p-4 lg:p-6 space-y-4">
                                            <div className="grid gap-3 md:grid-cols-[1.5fr,1fr] items-start">
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <h3 className="font-bold text-lg leading-tight">{order.orderNumber}</h3>
                                                        <Badge variant={order.status === 'IN_PROGRESS' ? "default" : "secondary"}>
                                                            {order.status}
                                                        </Badge>
                                                    </div>
                                                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                                                        {order.bom.productVariant.name}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">{t('formula')}: {order.bom.name}</p>
                                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                        <Clock className="h-4 w-4" />
                                                        {format(new Date(order.plannedStartDate), 'MMM dd, yyyy')}
                                                    </div>
                                                </div>

                                                <div className="flex flex-col items-start md:items-end gap-2 md:gap-1 text-xs">
                                                    <div className="flex flex-wrap gap-2 md:justify-end">
                                                        {order.machine ? (
                                                            <div className="flex items-center gap-2 text-emerald-700 font-semibold bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1.5 rounded-full border border-emerald-100 dark:border-emerald-800/30">
                                                                <Factory className="h-3 w-3" />
                                                                {order.machine.code}
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-center gap-2 text-red-600 font-semibold bg-red-50 dark:bg-red-900/20 px-3 py-1.5 rounded-full border border-red-100 dark:border-red-800/30">
                                                                <Factory className="h-3 w-3" /> {t('noMachine')}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="text-[11px] text-muted-foreground">
                                                        {t('qtyAbbr')}: {Number(order.plannedQuantity).toLocaleString()} {order.bom.productVariant.primaryUnit}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="space-y-1.5">
                                                <div className="flex items-center justify-between text-xs font-medium">
                                                    <span className="text-muted-foreground">{t('progress')}: {progress.toFixed(1)}%</span>
                                                    <span className="font-bold">
                                                        {Number(order.actualQuantity || 0).toLocaleString()} / {Number(order.plannedQuantity).toLocaleString()} {order.bom.productVariant.primaryUnit}
                                                    </span>
                                                </div>
                                                <Progress value={progress} className="h-2" />
                                            </div>

                                            <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                                                <div className="flex items-center justify-between gap-3 mb-1.5">
                                                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('workShift')}</div>
                                                    <ShiftManager orderId={order.id} shifts={order.shifts} operators={employees} helpers={employees} workShifts={workShifts} machines={machines} />
                                                </div>
                                                {order.shifts.length === 0 ? (
                                                    <div className="text-[11px] text-muted-foreground">
                                                        {t('noTeam')}
                                                    </div>
                                                ) : (
                                                    <div className="space-y-1.5">
                                                        {order.shifts.slice(0, 2).map((shift) => (
                                                            <div key={shift.id} className="flex items-center justify-between text-xs p-1.5 rounded bg-slate-50 dark:bg-slate-800/30">
                                                                <div className="flex items-center gap-1.5">
                                                                    <User size={11} className="text-muted-foreground" />
                                                                    <span className="font-medium">{shift.operator?.name || t('unassigned')}</span>
                                                                </div>
                                                                <span className="text-muted-foreground text-[10px]">{format(new Date(shift.startTime), 'HH:mm')}</span>
                                                            </div>
                                                        ))}
                                                        {order.shifts.length > 2 && (
                                                            <div className="text-[10px] text-muted-foreground">{t('moreShifts', { count: order.shifts.length - 2 })}</div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                    <User size={14} />
                                                    <span>{order.executions[0]?.operator?.name || t('unassigned')}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <ReassignMachineButton orderId={order.id} orderNumber={order.orderNumber} currentMachineId={order.machine?.id ?? null} machines={machines} />
                                                    <Link href={`/production/orders/${order.id}`}>
                                                        <Button variant="ghost" size="sm" className="h-8 text-xs">
                                                            {t('manageDetail')} <ChevronRight className="h-4 w-4 ml-1" />
                                                        </Button>
                                                    </Link>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </div>
                                </Card>
                            );
                        })
                    )}
                </div>

                {/* Right Column: Dispatch Actions */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                                <Send className="h-4 w-4 text-emerald-600" />
                                {t('shortcuts')}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-3">
                            <Button className="w-full justify-start text-xs h-9" variant="outline">
                                <Factory className="mr-2 h-4 w-4" /> {t('moveWorkCenter')}
                            </Button>
                            <Button className="w-full justify-start text-xs h-9" variant="outline">
                                <Clock className="mr-2 h-4 w-4" /> {t('rescheduleOrder')}
                            </Button>
                            <Button className="w-full justify-start text-xs h-9" variant="outline">
                                <User className="mr-2 h-4 w-4" /> {t('changeTeamShift')}
                            </Button>
                        </CardContent>
                    </Card>

                    <Card className="bg-slate-900 text-white">
                        <CardHeader>
                            <CardTitle className="text-sm">{t('handoverNote')}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-[11px] text-slate-400 italic">
                                &quot;Mesin EXT-01 agak lambat di heater no 3. Sudah dilaporkan ke maintenance.&quot;
                            </p>
                            <Button variant="link" className="text-sky-400 text-xs p-0 mt-2 h-auto">{t('viewAllNotes')}</Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

function cn(...inputs: (string | boolean | undefined | null)[]) {
    return inputs.filter(Boolean).join(' ');
}
