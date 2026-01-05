import { EmployeeForm } from '@/components/production/EmployeeForm';

export default function NewEmployeePage() {
    return (
        <div className="p-8 max-w-2xl">
            <h1 className="text-2xl font-bold text-slate-900 mb-6">Add Production Worker</h1>
            <div className="bg-white p-6 rounded-lg border shadow-sm">
                <EmployeeForm />
            </div>
        </div>
    );
}
