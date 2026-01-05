import { EmployeeForm } from '@/components/production/EmployeeForm';
import { getEmployeeById } from '@/actions/employees';
import { notFound } from 'next/navigation';

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function EditEmployeePage({ params }: PageProps) {
    const { id } = await params;
    const employee = await getEmployeeById(id);

    if (!employee) {
        notFound();
    }

    return (
        <div className="p-8 max-w-2xl">
            <h1 className="text-2xl font-bold text-slate-900 mb-6">Edit Staff Details</h1>
            <div className="bg-white p-6 rounded-lg border shadow-sm">
                <EmployeeForm initialData={employee} />
            </div>
        </div>
    );
}
