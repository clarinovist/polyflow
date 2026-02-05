import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Clock, ShieldCheck, Hash, Plus } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default async function ProductionResourcesPage() {
    const employees = await prisma.employee.findMany({
        orderBy: { name: 'asc' }
    });

    const activeCount = employees.filter(e => e.status === 'ACTIVE').length;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Team & Resources</h2>
                    <p className="text-muted-foreground">Manage production staff, shifts, and skill matrices.</p>
                </div>
                <Link href="/dashboard/employees/create">
                    <Button variant="outline">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Staff
                    </Button>
                </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total Staff</CardTitle>
                        <Users className="h-4 w-4 text-emerald-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{employees.length}</div>
                        <p className="text-xs text-muted-foreground font-medium mt-1">Personnel Directory</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Active Members</CardTitle>
                        <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-emerald-600">{activeCount}</div>
                        <p className="text-xs text-muted-foreground mt-1">Available for assignment</p>
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
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Staff Directory</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {employees.map((emp) => (
                            <div key={emp.id} className="flex items-center p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 space-x-4">
                                <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-700 dark:text-emerald-400 font-bold">
                                    {emp.name?.charAt(0) || 'E'}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">{emp.name}</p>
                                    <div className="flex items-center text-xs text-muted-foreground">
                                        <Hash className="mr-1 h-3 w-3 shrink-0" />
                                        <span className="truncate">{emp.code}</span>
                                    </div>
                                </div>
                                <Badge
                                    variant={emp.status === 'ACTIVE' ? 'outline' : 'secondary'}
                                    className={emp.status === 'ACTIVE'
                                        ? "text-[9px] bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800/50"
                                        : "text-[9px]"}
                                >
                                    {emp.status}
                                </Badge>
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
