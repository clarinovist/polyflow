import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, Warehouse, TrendingUp, AlertTriangle, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { getDashboardStats } from '@/actions/inventory';

export default async function DashboardPage() {
    const stats = await getDashboardStats();

    return (
        <div className="p-8 space-y-10">
            <div>
                <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
                <p className="text-slate-600 mt-2">Welcome to PolyFlow ERP System</p>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Products"
                    value={stats.productCount.toString()}
                    icon={Package}
                    href="/dashboard/products"
                    color="text-blue-600"
                    description="Total items in master"
                />
                <StatCard
                    title="Total Stock"
                    value={stats.totalStock.toLocaleString()}
                    icon={Warehouse}
                    href="/dashboard/inventory"
                    color="text-emerald-600"
                    description="Units across all locations"
                />
                <StatCard
                    title="Low Stock"
                    value={stats.lowStockCount.toString()}
                    icon={AlertTriangle}
                    href="/dashboard/inventory?lowStock=true"
                    color={stats.lowStockCount > 0 ? "text-amber-600" : "text-slate-400"}
                    description="Items below threshold"
                    alert={stats.lowStockCount > 0}
                />
                <StatCard
                    title="Active Movements"
                    value={stats.recentMovements.toString()}
                    icon={TrendingUp}
                    href="/dashboard/inventory/history"
                    color="text-purple-600"
                    description="Stock changes (24h)"
                />
            </div>

            {/* Quick Actions */}
            <div>
                <h2 className="text-xl font-semibold text-slate-900 mb-6">Quick Actions</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <ActionCard
                        title="Create Product"
                        description="Add new product to master data"
                        href="/dashboard/products/create"
                        icon={Package}
                        iconColor="bg-blue-100 text-blue-600"
                    />
                    <ActionCard
                        title="Stock Adjustment"
                        description="Adjust inventory quantities"
                        href="/dashboard/inventory/adjustment"
                        icon={Warehouse}
                        iconColor="bg-emerald-100 text-emerald-600"
                    />
                    <ActionCard
                        title="Internal Transfer"
                        description="Move stock between locations"
                        href="/dashboard/inventory/transfer"
                        icon={TrendingUp}
                        iconColor="bg-purple-100 text-purple-600"
                    />
                </div>
            </div>
        </div>
    );
}

function StatCard({ title, value, icon: Icon, href, color, description, alert }: {
    title: string;
    value: string;
    icon: any;
    href: string;
    color: string;
    description?: string;
    alert?: boolean;
}) {
    return (
        <Link href={href}>
            <Card className={cn(
                "hover:shadow-md transition-all cursor-pointer border-none shadow-sm",
                alert && "ring-1 ring-amber-200 bg-amber-50/10"
            )}>
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
        </Link>
    );
}

function ActionCard({ title, description, href, icon: Icon, iconColor }: {
    title: string;
    description: string;
    href: string;
    icon: any;
    iconColor: string;
}) {
    return (
        <Link href={href}>
            <Card className="group hover:shadow-md transition-all cursor-pointer border-none shadow-sm h-full">
                <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                        <div className={cn("p-3 rounded-xl", iconColor)}>
                            <Icon className="h-6 w-6" />
                        </div>
                        <ArrowRight className="h-5 w-5 text-slate-300 group-hover:text-slate-400 group-hover:translate-x-1 transition-all" />
                    </div>
                    <div className="mt-4">
                        <h3 className="font-semibold text-slate-900">{title}</h3>
                        <p className="text-sm text-slate-500 mt-1">{description}</p>
                    </div>
                </CardContent>
            </Card>
        </Link>
    );
}
function cn(...inputs: any[]) {
    return inputs.filter(Boolean).join(' ');
}
