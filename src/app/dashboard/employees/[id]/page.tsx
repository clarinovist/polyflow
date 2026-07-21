import { getEmployeeById } from '@/actions/admin/employees';
import { Employee360Tabs } from '@/components/hrd/employee-360/Employee360Tabs';
import { notFound } from 'next/navigation';
import type { Employee } from '@prisma/client';

interface EmployeeProfilePageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export default async function EmployeeProfilePage({ params, searchParams }: EmployeeProfilePageProps) {
  const { id } = await params;
  const { tab } = await searchParams;

  const result = await getEmployeeById(id);
  if (!result.success || !result.data) {
    notFound();
  }

  const employee = result.data as Employee;

  return (
    <div className="space-y-6">
      <Employee360Tabs employee={employee} initialTab={tab || 'overview'} />
    </div>
  );
}
