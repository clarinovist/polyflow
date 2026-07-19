import { getEmployees } from '@/actions/admin/employees';
import { Plus, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { EmployeesDirectory } from '@/components/hrd/EmployeesDirectory';
import type { EmployeeRecord } from '@/lib/hrd/employee-directory-helpers';

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; payType?: string; employment?: string }>;
}) {
  const params = await searchParams;
  const result = await getEmployees();

  if (!result.success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] border-2 border-dashed rounded-xl p-8 text-center bg-muted/5">
        <AlertCircle className="h-12 w-12 text-destructive mb-4 animate-pulse" />
        <h3 className="text-xl font-bold text-foreground">Gagal Memuat Karyawan</h3>
        <p className="text-muted-foreground mt-2 max-w-sm mx-auto">
          {result.error}
        </p>
        <Button variant="outline" className="mt-6" asChild>
          <Link href="/dashboard/employees">Coba Lagi</Link>
        </Button>
      </div>
    );
  }

  const rawEmployees = result.data || [];

  const employees: EmployeeRecord[] = rawEmployees.map((e: Record<string, unknown>) => ({
    id: e.id as string,
    name: e.name as string,
    code: e.code as string,
    role: e.role as string,
    status: e.status as string,
    payType: e.payType as string,
    employmentStatus: e.employmentStatus as string,
    probationEndDate: e.probationEndDate as Date | string | null,
    contractEndDate: e.contractEndDate as Date | string | null,
    dailyRate: typeof e.dailyRate === 'object' && e.dailyRate !== null && 'toNumber' in (e.dailyRate as object)
      ? (e.dailyRate as { toNumber(): number }).toNumber()
      : Number(e.dailyRate ?? 0),
    monthlySalary: e.monthlySalary != null
      ? (typeof e.monthlySalary === 'object' && 'toNumber' in (e.monthlySalary as object)
        ? (e.monthlySalary as { toNumber(): number }).toNumber()
        : Number(e.monthlySalary))
      : null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight uppercase">Karyawan</h1>
          <p className="text-sm text-muted-foreground">
            Master data operator produksi &amp; staff kantor
          </p>
        </div>
        <Link href="/dashboard/employees/create">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Tambah Karyawan
          </Button>
        </Link>
      </div>

      <EmployeesDirectory
        employees={employees}
        initialStatus={params.status}
        initialPayType={params.payType}
        initialEmployment={params.employment}
      />
    </div>
  );
}
