import { getEmployeeById } from '@/actions/admin/employees';
import { EmployeeForm } from '@/components/production/EmployeeForm';
import { Card, CardContent } from '@/components/ui/card';
import { notFound } from 'next/navigation';
import { Employee } from '@prisma/client';

interface EditEmployeePageProps {
    params: Promise<{ id: string }>;
}

export default async function EditEmployeePage({ params }: EditEmployeePageProps) {
    const { id } = await params;
    const result = await getEmployeeById(id);

    if (!result.success || !result.data) {
        notFound();
    }

    const employee = result.data as Employee;
    const hasPin = Boolean(employee.pinHash);

    // Strip pinHash before passing to client component
    const { pinHash: _pinHash, ...employeeData } = employee;
    const formData = {
        ...employeeData,
        dailyRate: employee.dailyRate ? Number(employee.dailyRate) : 0,
        overtimeHourlyRate: employee.overtimeHourlyRate ? Number(employee.overtimeHourlyRate) : 0,
        standardDayHours: employee.standardDayHours ? Number(employee.standardDayHours) : 8,
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Edit Staff Details</h1>
                <p className="text-muted-foreground mt-1">
                    Update the information for {employee.name}.
                </p>
            </div>

            <Card className="bg-background/40 backdrop-blur-xl border-white/10 dark:border-white/5 shadow-xl border-0 overflow-hidden">
                <CardContent className="pt-6">
                    <EmployeeForm initialData={formData as unknown as Employee} hasPin={hasPin} />
                </CardContent>
            </Card>
        </div>
    );
}
