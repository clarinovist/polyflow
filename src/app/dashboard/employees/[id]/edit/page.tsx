import { getEmployeeById } from '@/actions/employees';
import { EmployeeForm } from '@/components/production/EmployeeForm';
import { Card, CardContent } from '@/components/ui/card';
import { notFound } from 'next/navigation';

interface EditEmployeePageProps {
    params: Promise<{ id: string }>;
}

export default async function EditEmployeePage({ params }: EditEmployeePageProps) {
    const { id } = await params;
    const result = await getEmployeeById(id);

    if (!result.success || !result.data) {
        notFound();
    }

    const employee = result.data;

    // Convert decimal to number for the form
    const employeeData = {
        ...employee,
        hourlyRate: employee.hourlyRate ? Number(employee.hourlyRate) : 0,
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
                    <EmployeeForm initialData={employeeData as unknown as Parameters<typeof EmployeeForm>[0]['initialData']} />
                </CardContent>
            </Card>
        </div>
    );
}
