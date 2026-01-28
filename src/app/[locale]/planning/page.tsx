import { getPlanningDashboardStats } from '@/actions/planning-dashboard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Activity, AlertTriangle, CheckCircle2, Factory, Hammer, Settings2, Truck, ClipboardCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';

export const dynamic = 'force-dynamic';

export default async function PlanningDashboardPage() {
    const stats = await getPlanningDashboardStats();

    return (
        <div className="p-6 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Mission Control</h1>
                    <p className="text-muted-foreground">Real-time overview of production and procurement.</p>
                </div>
                <div className="flex gap-2">
                    <Button asChild variant="outline">
                        <Link href="/planning/mrp">
                            Check Shortages
                        </Link>
                    </Button>
                    <Button asChild>
                        <Link href="/planning/schedule">
                            View Schedule
                        </Link>
                    </Button>
                    <Button asChild className="bg-amber-600 hover:bg-amber-700">
                        <Link href="/planning/requests">
                            <Factory className="mr-2 h-4 w-4" />
                            Production Requests
                        </Link>
                    </Button>
                    <Button asChild variant="secondary">
                        <Link href="/planning/purchase-requests">
                            <ClipboardCheck className="mr-2 h-4 w-4" />
                            Purchase Requests
                        </Link>
                    </Button>
                </div>
            </div>

            {/* Hero Stats */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Production</CardTitle>
                        <Factory className="h-4 w-4 text-emerald-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.activeJobsCount}</div>
                        <p className="text-xs text-muted-foreground">Jobs currently running</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Planned Work</CardTitle>
                        <Activity className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.plannedJobsCount}</div>
                        <p className="text-xs text-muted-foreground">Draft & Released orders</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Machine Health</CardTitle>
                        <Settings2 className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-bold">{stats.machineStats.active}/{stats.machineStats.total}</span>
                            <span className="text-xs text-muted-foreground">Active</span>
                        </div>
                        <div className="mt-2 h-1 w-full bg-muted overflow-hidden rounded-full">
                            <div
                                className="h-full bg-emerald-500"
                                style={{ width: `${(stats.machineStats.active / (stats.machineStats.total || 1)) * 100}%` }}
                            />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Open Procurement</CardTitle>
                        <Truck className="h-4 w-4 text-purple-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.procurement.openPos}</div>
                        <p className="text-xs text-muted-foreground">Active Purchase Orders</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-7">
                {/* Timeline / Recent Orders */}
                <Card className="md:col-span-4">
                    <CardHeader>
                        <CardTitle>Upcoming Production</CardTitle>
                        <CardDescription>
                            Next 5 jobs scheduled to run or currently running.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {stats.recentOrders.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-8">No active production schedule.</p>
                            ) : (
                                stats.recentOrders.map(order => (
                                    <div key={order.id} className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-sm">{order.orderNumber}</span>
                                                <Badge variant={order.status === 'IN_PROGRESS' ? 'default' : 'outline'} className="text-[10px] h-5">
                                                    {order.status.replace('_', ' ')}
                                                </Badge>
                                            </div>
                                            <p className="text-xs text-muted-foreground">{order.bom.name}</p>
                                        </div>
                                        <div className="text-right space-y-1">
                                            <div className="text-xs font-medium">{format(new Date(order.plannedStartDate), 'MMM dd')}</div>
                                            <div className="text-[10px] text-muted-foreground">
                                                {order.machine ? order.machine.code : 'No Machine'}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Machine Status Overview Widget */}
                <Card className="md:col-span-3">
                    <CardHeader>
                        <CardTitle>Machine Status</CardTitle>
                        <CardDescription>
                            Quick view of fleet availability.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-3 border rounded-lg bg-emerald-50/50">
                                <div className="flex items-center gap-3">
                                    <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center">
                                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium">Active & Running</p>
                                        <p className="text-xs text-muted-foreground">Productive machines</p>
                                    </div>
                                </div>
                                <span className="text-xl font-bold text-emerald-700">{stats.machineStats.active}</span>
                            </div>

                            <div className="flex items-center justify-between p-3 border rounded-lg bg-amber-50/50">
                                <div className="flex items-center gap-3">
                                    <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center">
                                        <Hammer className="h-4 w-4 text-amber-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium">Maintenance</p>
                                        <p className="text-xs text-muted-foreground">Scheduled downtime</p>
                                    </div>
                                </div>
                                <span className="text-xl font-bold text-amber-700">{stats.machineStats.maintenance}</span>
                            </div>

                            <div className="flex items-center justify-between p-3 border rounded-lg bg-red-50/50">
                                <div className="flex items-center gap-3">
                                    <div className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center">
                                        <AlertTriangle className="h-4 w-4 text-red-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium">Broken / Down</p>
                                        <p className="text-xs text-muted-foreground">Requires attention</p>
                                    </div>
                                </div>
                                <span className="text-xl font-bold text-red-700">{stats.machineStats.broken}</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
