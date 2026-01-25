import { getProductionDashboardStats } from '@/actions/production-dashboard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Factory, Cog, CheckCircle2, FileClock, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function ProductionDashboardPage() {
    const stats = await getProductionDashboardStats();

    return (
        <div className="flex flex-col gap-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Production Floor</h1>
                <p className="text-muted-foreground mt-1">
                    Real-time monitoring and control of manufacturing operations.
                </p>
            </div>

            {/* Core Stats */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="border-t-4 border-t-amber-500 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Jobs</CardTitle>
                        <Activity className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-amber-600">{stats.activeJobs}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Currently running on floor
                        </p>
                    </CardContent>
                </Card>
                <Card className="border-t-4 border-t-emerald-500 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Machine Health</CardTitle>
                        <Factory className="h-4 w-4 text-emerald-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.activeMachines} <span className="text-sm font-normal text-muted-foreground">/ {stats.totalMachines}</span></div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Operational machines
                        </p>
                    </CardContent>
                </Card>
                <Card className="border-t-4 border-t-blue-500 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Completed Jobs</CardTitle>
                        <CheckCircle2 className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.completedJobs}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Total historical completions
                        </p>
                    </CardContent>
                </Card>
                <Card className="border-t-4 border-t-indigo-500 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Draft/Planning</CardTitle>
                        <FileClock className="h-4 w-4 text-indigo-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.draftJobs}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Orders pending release
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Quick Actions / Shortcuts */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <Card className="hover:border-emerald-500/50 transition-colors">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Cog className="h-5 w-5 text-emerald-600" />
                            Machine Control
                        </CardTitle>
                        <CardDescription>Manage fleet status and maintenance</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Link href="/production/machines">
                            <Button className="w-full" variant="outline">View Machine Board</Button>
                        </Link>
                    </CardContent>
                </Card>

                <Card className="bg-slate-900 text-white">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-white">
                            <Activity className="h-5 w-5" />
                            Operator Kiosk
                        </CardTitle>
                        <CardDescription className="text-slate-400">Launch the simplified touch interface</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Link href="/kiosk">
                            <Button variant="secondary" className="w-full font-bold">Launch Kiosk Mode</Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
