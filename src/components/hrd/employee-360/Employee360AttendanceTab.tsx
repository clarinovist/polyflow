'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CalendarDays, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { listAttendanceByEmployee } from '@/actions/hrd/attendance-employee';

type Record = {
  id: string;
  workDate: Date | string;
  shiftName: string;
  clockInAt: Date | string | null;
  clockOutAt: Date | string | null;
  actualHours: number | null;
  overtimeHours: number;
  isOvertimeShift: boolean;
  status: string;
  dailyEarnings: number;
  totalEarnings: number;
  clockInPhotoUrl: string | null;
  clockOutPhotoUrl: string | null;
};

function fmtDate(d: Date | string): string {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d));
}
function fmtTime(d: Date | string | null): string {
  if (!d) return '-';
  return new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(d));
}
function fmtIdr(n: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
}
function fmtHours(n: number | null): string {
  return n != null ? n.toFixed(2) : '-';
}

function monthRange(base: Date) {
  const y = base.getUTCFullYear();
  const m = base.getUTCMonth();
  return {
    from: new Date(Date.UTC(y, m, 1)),
    to: new Date(Date.UTC(y, m + 1, 0)),
    label: new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(new Date(Date.UTC(y, m, 15))),
  };
}

interface Props {
  employeeId: string;
}

export function Employee360AttendanceTab({ employeeId }: Props) {
  const [records, setRecords] = useState<Record[]>([]);
  const [loading, setLoading] = useState(true);
  const [baseDate, setBaseDate] = useState(new Date());
  const [photoModal, setPhotoModal] = useState<string | null>(null);

  const load = useCallback(async (base: Date) => {
    setLoading(true);
    const { from, to } = monthRange(base);
    const res = await listAttendanceByEmployee(employeeId, from.toISOString(), to.toISOString());
    setRecords(res.success ? ((res.data ?? []) as unknown as Record[]) : []);
    setLoading(false);
  }, [employeeId]);

  useEffect(() => { load(baseDate); }, [baseDate, load]);

  const prevMonth = () => { const d = new Date(baseDate); d.setUTCMonth(d.getUTCMonth() - 1); setBaseDate(d); };
  const nextMonth = () => { const d = new Date(baseDate); d.setUTCMonth(d.getUTCMonth() + 1); setBaseDate(d); };

  const { label } = monthRange(baseDate);
  const daysPresent = records.filter(r => r.status === 'PRESENT').length;
  const daysAbsent = records.filter(r => r.status === 'ABSENT').length;
  const daysOnLeave = records.filter(r => r.status === 'ON_LEAVE').length;
  const totalHours = records.reduce((s, r) => s + (r.actualHours ?? 0), 0);


  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CalendarDays className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-base">Kehadiran</CardTitle>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-emerald-500/5 p-3 rounded-lg border border-emerald-500/10">
              <div className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Hadir</div>
              <div className="text-xl font-bold">{daysPresent}</div>
            </div>
            <div className="bg-rose-500/5 p-3 rounded-lg border border-rose-500/10">
              <div className="text-[10px] uppercase tracking-wider text-rose-700 dark:text-rose-400">Absen</div>
              <div className="text-xl font-bold">{daysAbsent}</div>
            </div>
            <div className="bg-amber-500/5 p-3 rounded-lg border border-amber-500/10">
              <div className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400">Cuti/Izin</div>
              <div className="text-xl font-bold">{daysOnLeave}</div>
            </div>
            <div className="bg-muted/30 p-3 rounded-lg">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Jam Kerja</div>
              <div className="text-xl font-bold">{fmtHours(totalHours)}</div>
            </div>
          </div>

          {loading ? (
            <p className="text-xs text-muted-foreground text-center py-8">Memuat…</p>
          ) : records.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">Tidak ada data kehadiran bulan ini.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Shift</TableHead>
                    <TableHead>Masuk</TableHead>
                    <TableHead>Pulang</TableHead>
                    <TableHead className="text-right">Jam</TableHead>
                    <TableHead className="text-right">Lembur</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Upah</TableHead>
                    <TableHead className="text-center">Selfie</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm">{fmtDate(r.workDate)}</TableCell>
                      <TableCell className="text-sm">{r.shiftName}</TableCell>
                      <TableCell className="text-sm font-mono">{fmtTime(r.clockInAt)}</TableCell>
                      <TableCell className="text-sm font-mono">{fmtTime(r.clockOutAt)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmtHours(r.actualHours)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{r.overtimeHours > 0 ? fmtHours(r.overtimeHours) : '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${
                          r.status === 'PRESENT' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/10' :
                          r.status === 'ABSENT' ? 'bg-rose-500/10 text-rose-600 border-rose-500/10' :
                          'bg-amber-500/10 text-amber-600 border-amber-500/10'
                        }`}>
                          {r.isOvertimeShift ? 'LEMBUR' : r.status === 'PRESENT' ? 'HADIR' : r.status === 'ABSENT' ? 'ALFA' : 'CUTI'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmtIdr(r.totalEarnings)}</TableCell>
                      <TableCell className="text-center">
                        {(r.clockInPhotoUrl || r.clockOutPhotoUrl) ? (
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => setPhotoModal(r.clockInPhotoUrl || r.clockOutPhotoUrl)}>
                            <Eye className="h-3 w-3 mr-1" />
                            Lihat
                          </Button>
                        ) : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Photo modal */}
      {photoModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPhotoModal(null)}>
          <div className="relative max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoModal} alt="Selfie absensi" className="w-full rounded-lg shadow-xl" />
            <Button variant="ghost" size="sm" className="absolute top-2 right-2 bg-black/50 text-white hover:bg-black/70" onClick={() => setPhotoModal(null)}>
              ✕
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
