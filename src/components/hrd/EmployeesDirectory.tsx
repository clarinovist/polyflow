'use client';

import { useState, useMemo } from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Search } from 'lucide-react';
import { EmployeeActions } from '@/components/production/EmployeeActions';
import {
  matchesEmployeeFilters,
  salarySummaryText,
  urgencyBadge,
  type EmployeeRecord,
} from '@/lib/hrd/employee-directory-helpers';
import { payTypeLabels, employmentStatusLabels, employeeStatusLabels } from '@/lib/labels/hrd-employees';

interface Props {
  employees: EmployeeRecord[];
  initialStatus?: string;
  initialPayType?: string;
  initialEmployment?: string;
}

const PAY_TYPE_COLORS: Record<string, string> = {
  DAILY: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20',
  PIECE: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20',
  MONTHLY: 'bg-primary/10 text-primary border-primary/20',
};

export function EmployeesDirectory({ employees, initialStatus, initialPayType, initialEmployment }: Props) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(initialStatus || '');
  const [payType, setPayType] = useState(initialPayType || '');
  const [employment, setEmployment] = useState(initialEmployment || '');

  const filtered = useMemo(() => {
    return employees.filter(e => matchesEmployeeFilters(e, { q, status: status || undefined, payType: payType || undefined, employment: employment || undefined }));
  }, [employees, q, status, payType, employment]);

  const hasFilters = q || status || payType || employment;

  return (
    <div className="space-y-4">
      {/* Search + filters */}
      <div className="flex flex-wrap gap-3 items-center bg-card p-4 rounded-xl border">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cari nama atau kode…"
            className="pl-9 h-9 text-sm"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select value={status || '__all__'} onValueChange={(v) => setStatus(v === '__all__' ? '' : v)}>
          <SelectTrigger className="w-[130px] h-9 text-sm">
            <SelectValue placeholder="Semua Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Semua Status</SelectItem>
            <SelectItem value="ACTIVE">Aktif</SelectItem>
            <SelectItem value="INACTIVE">Nonaktif</SelectItem>
          </SelectContent>
        </Select>
        <Select value={payType || '__all__'} onValueChange={(v) => setPayType(v === '__all__' ? '' : v)}>
          <SelectTrigger className="w-[140px] h-9 text-sm">
            <SelectValue placeholder="Semua Basis" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Semua Basis</SelectItem>
            <SelectItem value="DAILY">Harian</SelectItem>
            <SelectItem value="PIECE">Borongan</SelectItem>
            <SelectItem value="MONTHLY">Bulanan</SelectItem>
          </SelectContent>
        </Select>
        <Select value={employment || '__all__'} onValueChange={(v) => setEmployment(v === '__all__' ? '' : v)}>
          <SelectTrigger className="w-[150px] h-9 text-sm">
            <SelectValue placeholder="Semua Kepegawaian" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Semua Kepegawaian</SelectItem>
            <SelectItem value="PROBATION">Probation</SelectItem>
            <SelectItem value="PERMANENT">Tetap</SelectItem>
            <SelectItem value="CONTRACT">Kontrak</SelectItem>
            <SelectItem value="RESIGNED">Resign</SelectItem>
            <SelectItem value="TERMINATED">PHK</SelectItem>
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => { setQ(''); setStatus(''); setPayType(''); setEmployment(''); }}>
            Reset
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="font-semibold text-muted-foreground w-[60px]">Kode</TableHead>
              <TableHead className="font-semibold text-muted-foreground">Nama</TableHead>
              <TableHead className="font-semibold text-muted-foreground">Jabatan</TableHead>
              <TableHead className="font-semibold text-muted-foreground">Basis</TableHead>
              <TableHead className="font-semibold text-muted-foreground">Status</TableHead>
              <TableHead className="font-semibold text-muted-foreground">Kepegawaian</TableHead>
              <TableHead className="font-semibold text-muted-foreground">Gaji Ringkas</TableHead>
              <TableHead className="font-semibold text-muted-foreground text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                  {hasFilters ? 'Tidak ada karyawan untuk filter ini.' : 'Belum ada karyawan. Tambah karyawan pertama.'}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((emp) => {
                const badge = urgencyBadge(emp);
                return (
                  <TableRow
                    key={emp.id}
                    className="hover:bg-muted/30 cursor-pointer"
                    onClick={() => { window.location.href = `/dashboard/employees/${emp.id}/edit`; }}
                  >
                    <TableCell className="font-mono text-xs text-muted-foreground">{emp.code}</TableCell>
                    <TableCell className="font-medium text-sm">{emp.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] font-bold py-0 h-5">{emp.role}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] font-bold py-0 h-5 ${PAY_TYPE_COLORS[emp.payType] || ''}`}>
                        {payTypeLabels[emp.payType] || emp.payType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] font-bold py-0 h-5 ${
                        emp.status === 'ACTIVE'
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'
                          : 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20'
                      }`}>
                        {employeeStatusLabels[emp.status] || emp.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px] font-bold py-0 h-5">
                          {employmentStatusLabels[emp.employmentStatus] || emp.employmentStatus}
                        </Badge>
                        {badge && (
                          <Badge
                            variant="outline"
                            className={`text-[10px] font-bold py-0 h-5 ${
                              badge.variant === 'amber'
                                ? 'bg-amber-500/10 text-amber-700 border-amber-500/20'
                                : 'bg-red-500/10 text-red-700 border-red-500/20'
                            }`}
                          >
                            {badge.text}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {salarySummaryText(emp)}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <EmployeeActions id={emp.id} name={emp.name} payType={emp.payType as 'DAILY' | 'PIECE' | 'MONTHLY'} />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Footer count */}
      <div className="text-xs text-muted-foreground px-1">
        Menampilkan {filtered.length} dari {employees.length} karyawan
      </div>
    </div>
  );
}
