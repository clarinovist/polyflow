import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Factory, Clock, CheckCircle, AlertCircle, Plus, ChevronRight, FlaskConical, Users } from 'lucide-react';
import Link from 'next/link';
import { getProductionOrders } from '@/actions/production';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { ProductionGlossary } from '@/components/production/ProductionGlossary';

export default async function ProductionDashboardPage() {
    const orders = await getProductionOrders();

    // Calculate Stats
    const activeOrders = orders.filter(o => o.status === 'IN_PROGRESS').length;
    const pendingOrders = orders.filter(o => o.status === 'DRAFT' || o.status === 'RELEASED').length;
    const completedOrders = orders.filter(o => o.status === 'COMPLETED').length;

    // Sort by recent
    const recentOrders = [...orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5);

    return (
        <div className="p-8 space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Production</h1>
                    <p className="text-slate-600 mt-2">Manage manufacturing active orders and operations</p>
                </div>
                <div className="flex gap-2">
                    <ProductionGlossary />
                    <Link href="/dashboard/production/resources/machines">
                        <Button variant="outline" className="gap-2">
                            <Factory className="h-4 w-4" />
                            Machines
                        </Button>
                    </Link>
                    <Link href="/dashboard/production/resources/employees">
                        <Button variant="outline" className="gap-2">
                            <Users className="h-4 w-4" />
                            Staff
                        </Button>
                    </Link>
                    <Link href="/dashboard/production/boms">
                        <Button variant="outline" className="gap-2">
                            <FlaskConical className="h-4 w-4" />
                            Manage Recipes
                        </Button>
                    </Link>
                    <Link href="/dashboard/production/orders/create">
                        <Button className="gap-2">
                            <Plus className="h-4 w-4" />
                            New Production Order
                        </Button>
                    </Link>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard
                    title="Active Orders"
                    value={activeOrders.toString()}
                    icon={Factory} // Animate?
                    color="text-blue-600"
                    description="Currently in production"
                />
                <StatCard
                    title="Pending"
                    value={pendingOrders.toString()}
                    icon={Clock}
                    color="text-amber-600"
                    description="Draft or Released"
                />
                <StatCard
                    title="Completed"
                    value={completedOrders.toString()}
                    icon={CheckCircle}
                    color="text-emerald-600"
                    description="Total completed orders"
                />
            </div>

            {/* Recent Orders */}
            <Card className="border-none shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Recent Orders</CardTitle>
                    <Link href="/dashboard/production/orders" className="text-sm text-blue-600 hover:underline">
                        View All
                    </Link>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 font-medium">
                                <tr>
                                    <th className="p-3">Order #</th>
                                    <th className="p-3">Product</th>
                                    <th className="p-3">Status</th>
                                    <th className="p-3">Machine</th>
                                    <th className="p-3">Planned Qty</th>
                                    <th className="p-3">Start Date</th>
                                    <th className="p-3"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {recentOrders.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="p-8 text-center text-slate-500">
                                            No recent orders found.
                                        </td>
                                    </tr>
                                ) : (
                                    recentOrders.map((order) => (
                                        <tr key={order.id} className="hover:bg-slate-50 group">
                                            <td className="p-3 font-medium">{order.orderNumber}</td>
                                            <td className="p-3">
                                                <div className="font-medium text-slate-900">{order.bom.productVariant.name}</div>
                                                <div className="text-xs text-slate-500">{order.bom.name}</div>
                                            </td>
                                            <td className="p-3">
                                                <StatusBadge status={order.status} />
                                            </td>
                                            <td className="p-3">
                                                {order.machine ? (
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs bg-slate-100 px-2 py-1 rounded">{order.machine.code}</span>
                                                    </div>
                                                ) : <span className="text-slate-400">-</span>}
                                            </td>
                                            <td className="p-3">
                                                {order.plannedQuantity.toLocaleString()} {order.bom.productVariant.primaryUnit}
                                            </td>
                                            <td className="p-3">
                                                {format(new Date(order.plannedStartDate), 'MMM dd, yyyy')}
                                            </td>
                                            <td className="p-3 text-right">
                                                <Link href={`/dashboard/production/orders/${order.id}`}>
                                                    <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100">
                                                        View <ChevronRight className="h-4 w-4 ml-1" />
                                                    </Button>
                                                </Link>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

function StatCard({ title, value, icon: Icon, color, description }: any) {
    return (
        <Card className="border-none shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-500">{title}</CardTitle>
                <div className={cn("p-2 rounded-lg bg-slate-50", color.replace('text-', 'bg-').replace('-600', '-50'))}>
                    <Icon className={cn("h-4 w-4", color)} />
                </div>
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold text-slate-900">{value}</div>
                {description && (
                    <p className="text-xs text-slate-500 mt-1">{description}</p>
                )}
            </CardContent>
        </Card>
    );
}

function StatusBadge({ status }: { status: string }) {
    const styles: Record<string, string> = {
        DRAFT: "bg-slate-100 text-slate-700",
        RELEASED: "bg-blue-100 text-blue-700",
        IN_PROGRESS: "bg-amber-100 text-amber-700",
        COMPLETED: "bg-emerald-100 text-emerald-700",
        CANCELLED: "bg-red-100 text-red-700",
    };

    return (
        <Badge variant="outline" className={cn("border-0", styles[status] || styles.DRAFT)}>
            {status.replace('_', ' ')}
        </Badge>
    );
}
