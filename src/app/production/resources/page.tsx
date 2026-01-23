import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Clock, ShieldCheck, Mail } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function ProductionResourcesPage() {
    const employees = await prisma.user.findMany({
        where: { role: 'PRODUCTION' },
        orderBy: { name: 'asc' }
    });

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Team & Resources</h2>
                    <p className="text-muted-foreground">Manage production staff, shifts, and skill matrices.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total Staff</CardTitle>
                        <Users className="h-4 w-4 text-emerald-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{employees.length}</div>
                        <p className="text-xs text-muted-foreground font-medium mt-1">Active Production Personnel</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Active Shift</CardTitle>
                        <Clock className="h-4 w-4 text-emerald-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-amber-600">Shift 1 (Day)</div>
                        <p className="text-xs text-muted-foreground mt-1">08:00 - 16:00 (Next: Shift 2)</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">On-Duty Leads</CardTitle>
                        <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">2 Leaders</div>
                        <p className="text-xs text-muted-foreground mt-1">Supervising present stations</p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Staff Directory</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {employees.map((emp) => (
                            <div key={emp.id} className="flex items-center p-3 rounded-lg border border-zinc-200 bg-white/50 space-x-4">
                                <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-700 dark:text-emerald-400 font-bold">
                                    {emp.name?.charAt(0) || 'U'}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-zinc-900 truncate">{emp.name}</p>
                                    <div className="flex items-center text-xs text-muted-foreground">
                                        <Mail className="mr-1 h-3 w-3 shrink-0" />
                                        <span className="truncate">{emp.email}</span>
                                    </div>
                                </div>
                                <Badge variant="outline" className="text-[9px] bg-emerald-50 text-emerald-600 border-emerald-100">Active</Badge>
                            </div>
                        ))}
                    </div>
                    {employees.length === 0 && (
                        <div className="text-center py-12 text-muted-foreground italic border-2 border-dashed rounded-lg">
                            No production personnel found in the directory.
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
