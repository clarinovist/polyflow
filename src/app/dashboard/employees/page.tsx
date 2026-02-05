import { getEmployees } from '@/actions/employees';
import { Card, CardContent } from '@/components/ui/card';
import { UserCheck, Plus, Search, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import Link from 'next/link';
import { EmployeeActions } from '@/components/production/EmployeeActions';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default async function EmployeesPage({
    searchParams,
}: {
    searchParams: Promise<{ status?: string }>;
}) {
    const params = await searchParams;
    const statusParam = params.status;
    const isValidStatus = statusParam && (statusParam === 'ACTIVE' || statusParam === 'INACTIVE');

    const result = await getEmployees();

    if (!result.success) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] border-2 border-dashed rounded-xl p-8 text-center bg-muted/5">
                <AlertCircle className="h-12 w-12 text-destructive mb-4 animate-pulse" />
                <h3 className="text-xl font-bold text-foreground">Failed to Load Personnel</h3>
                <p className="text-muted-foreground mt-2 max-w-sm mx-auto">
                    {result.error}
                </p>
                <Button variant="outline" className="mt-6" onClick={() => window.location.reload()}>
                    Try Again
                </Button>
            </div>
        );
    }

    const allEmployees = result.data || [];
    const currentStatus = statusParam || 'all';

    const filteredEmployees = isValidStatus
        ? allEmployees.filter(e => e.status === statusParam)
        : allEmployees;

    return (
        <div className="flex flex-col gap-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Production Personnel</h1>
                    <p className="text-muted-foreground mt-1">
                        Manage your workforce, operators, and production staff.
                    </p>
                </div>
                <Link href="/dashboard/employees/create">
                    <Button>
                        <Plus className="h-4 w-4 mr-2" />
                        Onboard Staff
                    </Button>
                </Link>
            </div>

            <Tabs defaultValue={currentStatus} className="w-full">
                <TabsList className="mb-4">
                    <Link href="/dashboard/employees"><TabsTrigger value="all">All Staff</TabsTrigger></Link>
                    <Link href="/dashboard/employees?status=ACTIVE"><TabsTrigger value="ACTIVE">Active</TabsTrigger></Link>
                    <Link href="/dashboard/employees?status=INACTIVE"><TabsTrigger value="INACTIVE">Inactive</TabsTrigger></Link>
                </TabsList>

                <Card className="bg-background/40 backdrop-blur-xl border-white/10 dark:border-white/5 overflow-hidden shadow-xl">
                    <CardContent className="p-0">
                        <div className="p-4 bg-muted/10 border-b border-white/5">
                            <div className="relative max-w-sm">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input placeholder="Search staff members..." className="pl-9 bg-background/50 h-9 text-sm" />
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-muted/30">
                                    <TableRow className="hover:bg-transparent border-white/10 text-[11px] font-bold uppercase tracking-wider">
                                        <TableHead className="pl-6">Staff Member</TableHead>
                                        <TableHead>Employee Code</TableHead>
                                        <TableHead>Role</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right pr-6">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredEmployees.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                                                No personnel found for this status.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredEmployees.map((employee) => (
                                            <TableRow key={employee.id} className="group border-white/5 hover:bg-primary/[0.02] transition-colors">
                                                <TableCell className="pl-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 border border-white/5">
                                                            <UserCheck className="h-5 w-5 text-primary" />
                                                        </div>
                                                        <span className="font-bold text-sm tracking-tight text-foreground">{employee.name}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded border border-white/5">
                                                        {employee.code}
                                                    </span>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className="text-[10px] font-bold py-0 h-5 border-white/10 bg-background/50">
                                                        {employee.role}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className={employee.status === 'ACTIVE'
                                                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/10 text-[10px] h-5 font-bold"
                                                        : "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/10 text-[10px] h-5 font-bold"
                                                    }>
                                                        {employee.status}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right pr-6">
                                                    <EmployeeActions id={employee.id} name={employee.name} />
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </Tabs>
        </div>
    );
}
