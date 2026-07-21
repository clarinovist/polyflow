'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { User, CreditCard, Phone } from 'lucide-react';
import type { Employee } from '@prisma/client';

const GENDER_LABELS: Record<string, string> = { MALE: 'Laki-laki', FEMALE: 'Perempuan' };
const MARITAL_LABELS: Record<string, string> = { SINGLE: 'Belum kawin', MARRIED: 'Kawin', DIVORCED: 'Cerai', WIDOWED: 'Janda/Duda' };

function fmt(d: Date | string | null | undefined): string {
  if (!d) return '-';
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d));
}

function fmtIdr(n: number | { toNumber(): number } | null | undefined): string {
  if (n == null) return '-';
  const num = typeof n === 'number' ? n : n.toNumber();
  if (num === 0) return '-';
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(num);
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

interface Props {
  employee: Employee;
}

export function Employee360Overview({ employee }: Props) {
  const emp = employee as Employee & {
    nik?: string | null;
    npwp?: string | null;
    birthDate?: Date | null;
    birthPlace?: string | null;
    address?: string | null;
    bankName?: string | null;
    bankAccountNo?: string | null;
    bankAccountName?: string | null;
    bpjsKesehatanNo?: string | null;
    bpjsKetenagakerjaanNo?: string | null;
    bpjsEmployeeDeduction?: { toNumber(): number } | number | null;
    bpjsEmployerCost?: { toNumber(): number } | number | null;
    monthlySalary?: { toNumber(): number } | number | null;
    emergencyContactName?: string | null;
    emergencyContactPhone?: string | null;
    emergencyContactRelation?: string | null;
  };

  const toN = (v: unknown): number => {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'object' && 'toNumber' in (v as object)) return (v as { toNumber(): number }).toNumber();
    return Number(v);
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Data Pribadi */}
      <Card className="bg-background/40 backdrop-blur-xl border-white/10 dark:border-white/5 shadow-xl border-0">
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <User className="h-4 w-4" />
            Data Pribadi
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Row label="NIK" value={emp.nik || '-'} />
          <Row label="NPWP" value={emp.npwp || '-'} />
          <Row label="Tempat Lahir" value={emp.birthPlace || '-'} />
          <Row label="Tanggal Lahir" value={fmt(emp.birthDate)} />
          <Row label="Jenis Kelamin" value={emp.gender ? (GENDER_LABELS[emp.gender] || emp.gender) : '-'} />
          <Row label="Status Pernikahan" value={emp.maritalStatus ? (MARITAL_LABELS[emp.maritalStatus] || emp.maritalStatus) : '-'} />
          <Row label="Alamat" value={emp.address || '-'} />
          <Row label="Telepon" value={emp.phone || '-'} />
        </CardContent>
      </Card>

      {/* Bank & BPJS */}
      <Card className="bg-background/40 backdrop-blur-xl border-white/10 dark:border-white/5 shadow-xl border-0">
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Bank & BPJS
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Row label="Nama Bank" value={emp.bankName || '-'} />
          <Row label="No. Rekening" value={emp.bankAccountNo || '-'} />
          <Row label="Atas Nama" value={emp.bankAccountName || '-'} />
          <div className="border-t border-border/30 my-2" />
          <Row label="No. BPJS Kesehatan" value={emp.bpjsKesehatanNo || '-'} />
          <Row label="No. BPJS Ketenagakerjaan" value={emp.bpjsKetenagakerjaanNo || '-'} />
          <Row label="Iuran BPJS Karyawan" value={emp.bpjsParticipant ? fmtIdr(toN(emp.bpjsEmployeeDeduction)) : '-'} />
          <Row label="Iuran BPJS Perusahaan" value={emp.bpjsParticipant ? fmtIdr(toN(emp.bpjsEmployerCost)) : '-'} />
          {emp.payType === 'MONTHLY' && (
            <Row label="Gaji Bulanan" value={fmtIdr(toN(emp.monthlySalary))} />
          )}
        </CardContent>
      </Card>

      {/* Emergency Contact */}
      <Card className="bg-background/40 backdrop-blur-xl border-white/10 dark:border-white/5 shadow-xl border-0 md:col-span-2">
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Phone className="h-4 w-4" />
            Kontak Darurat
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <Row label="Nama" value={emp.emergencyContactName || '-'} />
          <Row label="Telepon" value={emp.emergencyContactPhone || '-'} />
          <Row label="Hubungan" value={emp.emergencyContactRelation || '-'} />
        </CardContent>
      </Card>
    </div>
  );
}
