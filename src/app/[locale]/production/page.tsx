import { getProductionDashboardStats } from '@/actions/production-dashboard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Factory, Cog, CheckCircle2, FileClock, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { BrandCard, BrandCardContent, BrandCardHeader, BrandGradientText } from '@/components/brand/BrandCard';
import { PageHeader } from '@/components/ui/page-header';

export const dynamic = 'force-dynamic';

export default async function ProductionDashboardPage() {
    const stats = await getProductionDashboardStats();

    return (
        <div className="flex flex-col gap-8">
            <PageHeader
                title="Production Floor"
                description="Real-time monitoring and control of manufacturing operations."
            />

            {/* Core Stats */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <Card className="shadow-sm border-l-4 border-l-amber-500">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Jobs</CardTitle>
                        <Activity className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.activeJobs}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Currently running on floor
                        </p>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-l-4 border-l-emerald-500">
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
                <Card className="shadow-sm border-l-4 border-l-blue-500">
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
                <Card className="shadow-sm border-l-4 border-l-indigo-500">
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

            <div className="grid gap-6 md:grid-cols-2">
                <Card className="bg-card hover:bg-muted/50 transition-colors border shadow-sm">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Cog className="h-5 w-5 text-primary" />
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

                <BrandCard variant="hero" className="border-none">
                    <BrandCardHeader className="border-white/10">
                        <div className="flex items-center gap-2">
                            <Activity className="h-5 w-5 text-white" />
                            <BrandGradientText className="text-xl font-bold italic uppercase tracking-wider">
                                Operator Kiosk
                            </BrandGradientText>
                        </div>
                    </BrandCardHeader>
                    <BrandCardContent>
                        <p className="text-sm text-white/60 mb-6">Launch the simplified touch interface</p>
                        <Link href="/kiosk">
                            <Button variant="secondary" className="w-full font-bold italic uppercase tracking-tight h-12">
                                Launch Kiosk Mode
                            </Button>
                        </Link>
                    </BrandCardContent>
                </BrandCard>
            </div>
        </div>
    );
}
