import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Users, MoreHorizontal, UserCircle, Briefcase } from 'lucide-react';
import Link from 'next/link';
import { getEmployees } from '@/actions/employees';
import { EmployeeActions } from '@/components/production/EmployeeActions';
import { Badge } from '@/components/ui/badge';
import { EmployeeStatus } from '@prisma/client';

export default async function EmployeesPage() {
    const employees = await getEmployees();

    return (
        <div className="p-8 space-y-8">
            <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                    <h1 className="text-3xl font-bold text-slate-900">Production Staff</h1>
                    <p className="text-slate-600">Manage operators, helpers, and production managers</p>
                </div>
                <Link href="/dashboard/production/resources/employees/new">
                    <Button className="gap-2">
                        <Plus className="h-4 w-4" />
                        Add Staff
                    </Button>
                </Link>
            </div>

            <div className="rounded-md border bg-white">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 font-medium">
                        <tr>
                            <th className="p-4">Name</th>
                            <th className="p-4">Code</th>
                            <th className="p-4">Role</th>
                            <th className="p-4">Status</th>
                            <th className="p-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {employees.map((employee) => (
                            <tr key={employee.id} className="hover:bg-slate-50 group">
                                <td className="p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                                            <UserCircle className="h-5 w-5" />
                                        </div>
                                        <span className="font-medium text-slate-900">{employee.name}</span>
                                    </div>
                                </td>
                                <td className="p-4 font-mono text-slate-600">{employee.code}</td>
                                <td className="p-4">
                                    <Badge variant="outline" className="capitalize">
                                        {employee.role.toLowerCase()}
                                    </Badge>
                                </td>
                                <td className="p-4">
                                    <StatusBadge status={employee.status} />
                                </td>
                                <td className="p-4 text-right">
                                    <EmployeeActions id={employee.id} name={employee.name} />
                                </td>
                            </tr>
                        ))}
                        {employees.length === 0 && (
                            <tr>
                                <td colSpan={5} className="p-12 text-center text-slate-500">
                                    No staff members found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function StatusBadge({ status }: { status: EmployeeStatus }) {
    const styles: Record<EmployeeStatus, string> = {
        ACTIVE: 'bg-emerald-100 text-emerald-700',
        INACTIVE: 'bg-slate-100 text-slate-500',
    };

    return (
        <Badge variant="secondary" className={styles[status]}>
            {status}
        </Badge>
    );
}
