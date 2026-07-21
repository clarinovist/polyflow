'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Pencil, DollarSign, User, CalendarDays, CreditCard, Phone, AlertTriangle, Shield } from 'lucide-react';
import type { Employee } from '@prisma/client';

const PAY_TYPE_LABELS: Record<string, string> = {
  DAILY: 'Harian',
  PIECE: 'Borongan /kg',
  MONTHLY: 'Bulanan',
};
const STATUS_LABELS: Record<string, string> = { ACTIVE: 'Aktif', INACTIVE: 'Nonaktif' };
const EMPLOYMENT_LABELS: Record<string, string> = {
  PROBATION: 'Probation',
  PERMANENT: 'Tetap',
  CONTRACT: 'Kontrak',
  RESIGNED: 'Resign',
  TERMINATED: 'PHK',
};
const GENDER_LABELS: Record<string, string> = { MALE: 'Laki-laki', FEMALE: 'Perempuan' };
const MARITAL_LABELS: Record<string, string> = { SINGLE: 'Belum kawin', MARRIED: 'Kawin', DIVORCED: 'Cerai', WIDOWED: 'Janda/Duda' };

function fmt(d: Date | string | null | undefined): string {
  if (!d) return '-';
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d));
}



function daysUntil(d: Date | string | null | undefined): number | null {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function urgencyBadge(emp: { probationEndDate?: Date | null; contractEndDate?: Date | null; employmentStatus?: string }) {
  if (emp.employmentStatus === 'RESIGNED' || emp.employmentStatus === 'TERMINATED') return null;
  const pDays = daysUntil(emp.probationEndDate);
  const cDays = daysUntil(emp.contractEndDate);
  if (pDays !== null && pDays >= 0 && pDays <= 30) {
    return { variant: pDays <= 7 ? 'destructive' as const : 'outline' as const, text: `Probation H-${pDays}` };
  }
  if (cDays !== null && cDays >= 0 && cDays <= 30) {
    return { variant: cDays <= 7 ? 'destructive' as const : 'outline' as const, text: `Kontrak H-${cDays}` };
  }
  return null;
}

interface Props {
  employee: Employee;
}

export function Employee360Header({ employee }: Props) {
  const emp = employee as Employee & {
    probationEndDate?: Date | null;
    contractEndDate?: Date | null;
    joinDate?: Date | null;
    employmentStatus?: string;
    gender?: string | null;
    maritalStatus?: string | null;
    photoUrl?: string | null;
  };
  const badge = urgencyBadge(emp);
  const isPiece = emp.payType === 'PIECE';
  const isMonthly = emp.payType === 'MONTHLY';

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="shrink-0">
          {emp.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={emp.photoUrl}
              alt={emp.name}
              className="h-16 w-16 rounded-full object-cover border-2 border-border"
            />
          ) : (
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center text-xl font-bold text-muted-foreground">
              {emp.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight uppercase">{emp.name}</h1>
            <Badge variant={emp.status === 'ACTIVE' ? 'default' : 'secondary'} className="text-[10px]">
              {STATUS_LABELS[emp.status] || emp.status}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-muted-foreground">
            <span className="font-mono text-xs">{emp.code}</span>
            <span>·</span>
            <span>{emp.role}</span>
            <span>·</span>
            <Badge variant="outline" className={`text-[10px] ${isPiece ? 'text-amber-600 border-amber-500/30' : isMonthly ? 'text-blue-600 border-blue-500/30' : ''}`}>
              {PAY_TYPE_LABELS[emp.payType] || emp.payType}
            </Badge>
            {emp.employmentStatus && (
              <Badge variant="outline" className="text-[10px]">
                {EMPLOYMENT_LABELS[emp.employmentStatus] || emp.employmentStatus}
              </Badge>
            )}
            {badge && (
              <Badge variant={badge.variant} className="text-[10px]">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {badge.text}
              </Badge>
            )}
          </div>
        </div>
        {/* Actions */}
        <div className="flex gap-2 shrink-0">
          <Link href={`/dashboard/employees/${emp.id}/edit`}>
            <Button variant="outline" size="sm">
              <Pencil className="h-4 w-4 mr-1" />
              Edit
            </Button>
          </Link>
          <Link href={`/dashboard/employees/${emp.id}?tab=payroll-weekly`}>
            <Button variant="outline" size="sm">
              <DollarSign className="h-4 w-4 mr-1" />
              Gaji
            </Button>
          </Link>
        </div>
      </div>

      {/* Quick stats row */}
      <div className="flex gap-2 flex-wrap">
        {emp.joinDate && (
          <Badge variant="secondary" className="text-[10px] gap-1">
            <CalendarDays className="h-3 w-3" />
            Masuk {fmt(emp.joinDate)}
          </Badge>
        )}
        {emp.gender && (
          <Badge variant="secondary" className="text-[10px] gap-1">
            <User className="h-3 w-3" />
            {GENDER_LABELS[emp.gender] || emp.gender}
          </Badge>
        )}
        {emp.maritalStatus && (
          <Badge variant="secondary" className="text-[10px]">
            {MARITAL_LABELS[emp.maritalStatus] || emp.maritalStatus}
          </Badge>
        )}
        {emp.bpjsParticipant && (
          <Badge variant="secondary" className="text-[10px] gap-1">
            <Shield className="h-3 w-3" />
            BPJS Aktif
          </Badge>
        )}
        {emp.bankName && (
          <Badge variant="secondary" className="text-[10px] gap-1">
            <CreditCard className="h-3 w-3" />
            {emp.bankName}
          </Badge>
        )}
        {emp.phone && (
          <Badge variant="secondary" className="text-[10px] gap-1">
            <Phone className="h-3 w-3" />
            {emp.phone}
          </Badge>
        )}
      </div>
    </div>
  );
}
