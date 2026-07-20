import { getEmployeeById } from '@/actions/admin/employees';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Pencil, Clock, User } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Employee } from '@prisma/client';

interface EmployeeDetailPageProps {
  params: Promise<{ id: string }>;
}

const PAY_TYPE_LABELS: Record<string, string> = {
  DAILY: 'Harian',
  PIECE_RATE: 'Borongan /kg',
  MONTHLY: 'Bulanan',
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Aktif',
  INACTIVE: 'Nonaktif',
};

function formatDate(d: Date | string): string {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d));
}

export default async function EmployeeDetailPage({ params }: EmployeeDetailPageProps) {
  const { id } = await params;
  const result = await getEmployeeById(id);

  if (!result.success || !result.data) {
    notFound();
  }

  const emp = result.data as Employee;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight uppercase">{emp.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {emp.code} &middot; Detail Karyawan
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/dashboard/employees/${emp.id}/edit`}>
            <Button variant="outline" size="sm">
              <Pencil className="h-4 w-4 mr-1.5" />
              Edit
            </Button>
          </Link>
          <Link href={`/dashboard/employees/${emp.id}/payroll`}>
            <Button variant="outline" size="sm">
              <Clock className="h-4 w-4 mr-1.5" />
              Gaji
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-background/40 backdrop-blur-xl border-white/10 dark:border-white/5 shadow-xl border-0">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <User className="h-4 w-4" />
              Informasi Dasar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow label="Nama" value={emp.name} />
            <DetailRow label="Kode" value={emp.code} />
            <DetailRow label="Role" value={emp.role || '-'} />
            <DetailRow
              label="Status"
              value={
                <Badge variant={emp.status === 'ACTIVE' ? 'default' : 'secondary'}>
                  {STATUS_LABELS[emp.status] || emp.status}
                </Badge>
              }
            />
            <DetailRow label="Skema Gaji" value={PAY_TYPE_LABELS[emp.payType] || emp.payType || '-'} />
          </CardContent>
        </Card>

        <Card className="bg-background/40 backdrop-blur-xl border-white/10 dark:border-white/5 shadow-xl border-0">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Gaji & Tarif
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow
              label="Upah Harian"
              value={emp.dailyRate ? `Rp ${Number(emp.dailyRate).toLocaleString('id-ID')}` : '-'}
            />
            <DetailRow
              label="Tarif Lembur / Jam"
              value={emp.overtimeHourlyRate ? `Rp ${Number(emp.overtimeHourlyRate).toLocaleString('id-ID')}` : '-'}
            />
            <DetailRow label="Jam Kerja Standar" value={emp.standardDayHours ? `${emp.standardDayHours} jam` : '-'} />
            <DetailRow
              label="Gaji Bulanan"
              value={emp.monthlySalary ? `Rp ${Number(emp.monthlySalary).toLocaleString('id-ID')}` : '-'}
            />
          </CardContent>
        </Card>

        {(emp.joinDate || emp.nik || emp.phone) && (
          <Card className="bg-background/40 backdrop-blur-xl border-white/10 dark:border-white/5 shadow-xl border-0 md:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Data Pribadi</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              <DetailRow label="Tanggal Masuk" value={emp.joinDate ? formatDate(emp.joinDate) : '-'} />
              <DetailRow label="NIK" value={emp.nik || '-'} />
              <DetailRow label="Telepon" value={emp.phone || '-'} />
              <DetailRow label="Tempat Lahir" value={emp.birthPlace || '-'} />
              <DetailRow label="Tanggal Lahir" value={emp.birthDate ? formatDate(emp.birthDate) : '-'} />
              <DetailRow label="Jenis Kelamin" value={emp.gender === 'MALE' ? 'Laki-laki' : emp.gender === 'FEMALE' ? 'Perempuan' : '-'} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
