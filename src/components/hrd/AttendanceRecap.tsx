'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Clock, Users, ArrowUpDown, MoreHorizontal, Download } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import {
  setAbsent,
  correctAttendance,
  getAttendanceMonthlySummary,
  getAttendanceWeeklySummary,
} from '@/actions/admin/attendance';
import { startOfWeek, endOfWeek } from '@/services/hrd/week-range';
import Link from 'next/link';

interface AttendanceRecord {
  id: string;
  employeeId: string;
  workShiftId: string;
  employeeCode: string;
  employeeName: string;
  shiftName: string;
  plannedHours: number;
  clockInAt: Date | string | null;
  clockOutAt: Date | string | null;
  actualHours: number | null;
  overtimeHours: number;
  isOvertimeShift: boolean;
  status: string;
  source: string;
  clockInPhotoUrl?: string | null;
  clockOutPhotoUrl?: string | null;
}

interface DailySummary {
  totalEmployees: number;
  totalRecords: number;
  multiShiftCount: number;
  totalActualHours: number;
  totalOvertimeHours: number;
}

interface WorkShift {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  status?: string;
}

type ViewMode = 'daily' | 'weekly' | 'monthly';

interface MonthlySummary {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  daysPresent: number;
  daysAbsent: number;
  daysOnLeave: number;
  totalActualHours: number;
  totalOvertimeHours: number;
  multiShiftDays: number;
}

interface WeeklySummary {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  daysPresent: number;
  totalActualHours: number;
  totalOvertimeHours: number;
  totalDailyEarnings: number;
  totalOvertimeEarnings: number;
  totalEarnings: number;
}

function formatIdr(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
}

function weekLabel(start: Date, end: Date) {
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' };
  return `${start.toLocaleDateString('id-ID', opts)} – ${end.toLocaleDateString('id-ID', opts)}`;
}

interface Props {
  records: AttendanceRecord[];
  summary: DailySummary | null;
  shifts: WorkShift[];
  currentDate: string;
  currentShift?: string;
  overtimeOnly: boolean;
}

function formatTime(iso: Date | string | null): string {
  if (!iso) return '-';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' });
}

function formatHours(h: number | null): string {
  if (h == null) return '-';
  return `${h.toFixed(1)}j`;
}

const MONTH_NAMES = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

export function AttendanceRecap({ records, summary, shifts, currentDate, currentShift, overtimeOnly }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [correcting, setCorrecting] = useState<AttendanceRecord | null>(null);
  const [correctData, setCorrectData] = useState({ clockInAt: '', clockOutAt: '', notes: '' });
  const [actionLoading, setActionLoading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<{ url: string; title: string } | null>(null);

  const modeParam = searchParams.get('mode');
  const [viewMode, setViewMode] = useState<ViewMode>(
    modeParam === 'monthly' ? 'monthly' : modeParam === 'weekly' ? 'weekly' : 'daily'
  );

  const currentYear = Number(searchParams.get('year') || currentDate.slice(0, 4));
  const currentMonth = Number(searchParams.get('month') || currentDate.slice(5, 7));

  const [monthlyData, setMonthlyData] = useState<MonthlySummary[]>([]);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [weeklyData, setWeeklyData] = useState<WeeklySummary[]>([]);
  const [weeklyLoading, setWeeklyLoading] = useState(false);

  const weekBounds = useMemo(() => {
    const base = new Date(currentDate);
    return { start: startOfWeek(base), end: endOfWeek(base) };
  }, [currentDate]);

  const updateParam = (key: string, value: string | null) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (value) sp.set(key, value);
    else sp.delete(key);
    router.push(`/hrd/attendance?${sp.toString()}`);
  };

  const switchMode = (mode: ViewMode) => {
    setViewMode(mode);
    const sp = new URLSearchParams(searchParams.toString());
    sp.set('mode', mode);
    if (mode === 'daily') {
      sp.delete('year');
      sp.delete('month');
    } else if (mode === 'weekly') {
      sp.delete('year');
      sp.delete('month');
    } else if (mode === 'monthly') {
      sp.set('year', String(currentYear));
      sp.set('month', String(currentMonth));
    }
    router.push(`/hrd/attendance?${sp.toString()}`);
  };

  const loadMonthly = async (year: number, month: number) => {
    setMonthlyLoading(true);
    try {
      const res = await getAttendanceMonthlySummary(year, month);
      if (res.success) {
        setMonthlyData(res.data ?? []);
      } else {
        toast.error(res.error || 'Gagal memuat rekap bulanan');
      }
    } finally {
      setMonthlyLoading(false);
    }
  };

  const loadWeekly = async (dateStr: string) => {
    setWeeklyLoading(true);
    try {
      const base = new Date(dateStr);
      const ws = startOfWeek(base);
      const we = endOfWeek(base);
      const res = await getAttendanceWeeklySummary(ws.toISOString(), we.toISOString());
      if (res.success) {
        setWeeklyData((res.data as WeeklySummary[]) ?? []);
      } else {
        toast.error(res.error || 'Gagal memuat rekap mingguan');
      }
    } finally {
      setWeeklyLoading(false);
    }
  };

  useEffect(() => {
    if (viewMode === 'monthly') {
      loadMonthly(currentYear, currentMonth);
    } else if (viewMode === 'weekly') {
      loadWeekly(currentDate);
    }
  }, [viewMode, currentYear, currentMonth, currentDate]);

  const exportHref = (() => {
    if (viewMode === 'monthly') {
      return `/api/hrd/attendance/export?mode=monthly&year=${currentYear}&month=${currentMonth}`;
    }
    if (viewMode === 'weekly') {
      return `/api/hrd/attendance/export?mode=weekly&date=${currentDate}`;
    }
    const sp = new URLSearchParams({ mode: 'daily', date: currentDate });
    if (currentShift) sp.set('shift', currentShift);
    if (overtimeOnly) sp.set('ot', '1');
    return `/api/hrd/attendance/export?${sp.toString()}`;
  })();

  const handleSetAbsent = async (r: AttendanceRecord) => {
    setActionLoading(true);
    try {
      const res = await setAbsent(r.employeeId, currentDate, r.workShiftId);
      if (res.success) {
        toast.success(`${r.employeeName} ditandai tidak hadir`);
        router.refresh();
      } else {
        toast.error(res.error || 'Gagal set absent');
      }
    } catch {
      toast.error('Gagal set absent');
    } finally {
      setActionLoading(false);
    }
  };

  const openCorrect = (r: AttendanceRecord) => {
    setCorrecting(r);
    setCorrectData({
      clockInAt: r.clockInAt ? toLocalInput(r.clockInAt) : '',
      clockOutAt: r.clockOutAt ? toLocalInput(r.clockOutAt) : '',
      notes: '',
    });
  };

  const handleCorrect = async () => {
    if (!correcting) return;
    setActionLoading(true);
    try {
      const res = await correctAttendance(correcting.id, {
        clockInAt: correctData.clockInAt || undefined,
        clockOutAt: correctData.clockOutAt || undefined,
        notes: correctData.notes || undefined,
      });
      if (res.success) {
        toast.success('Koreksi tersimpan');
        setCorrecting(null);
        router.refresh();
      } else {
        toast.error(res.error || 'Gagal koreksi');
      }
    } catch {
      toast.error('Gagal koreksi');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center bg-card p-4 rounded-xl border">
        <div className="flex items-center bg-muted rounded-lg p-0.5">
          {(['daily', 'weekly', 'monthly'] as ViewMode[]).map((m) => (
            <button
              key={m}
              type="button"
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                viewMode === m ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => switchMode(m)}
            >
              {m === 'daily' ? 'Harian' : m === 'weekly' ? 'Mingguan' : 'Bulanan'}
            </button>
          ))}
        </div>

        {viewMode === 'daily' && (
          <>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-muted-foreground">Tanggal</label>
              <Input
                type="date"
                value={currentDate}
                onChange={(e) => updateParam('date', e.target.value)}
                className="w-[180px]"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-muted-foreground">Shift</label>
              <Select value={currentShift || '__all__'} onValueChange={(v) => updateParam('shift', v === '__all__' ? null : v)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Semua shift" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Semua shift</SelectItem>
                  {shifts.filter(s => s.status === 'ACTIVE').map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant={overtimeOnly ? 'default' : 'outline'}
              size="sm"
              onClick={() => updateParam('ot', overtimeOnly ? null : '1')}
              className="gap-1"
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              {overtimeOnly ? 'Lembur ON' : 'Filter Lembur'}
            </Button>
          </>
        )}

        {viewMode === 'weekly' && (
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-muted-foreground">Minggu</label>
            <Input
              type="date"
              value={currentDate}
              onChange={(e) => updateParam('date', e.target.value)}
              className="w-[180px]"
            />
            <span className="text-xs text-muted-foreground">
              {weekLabel(weekBounds.start, weekBounds.end)}
            </span>
            <Link href={`/hrd/payroll?date=${currentDate}`} className="text-xs text-muted-foreground hover:underline ml-1">
              → Gaji Mingguan
            </Link>
          </div>
        )}

        {viewMode === 'monthly' && (
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-muted-foreground">Periode</label>
            <Select
              value={String(currentMonth)}
              onValueChange={(v) => {
                const sp = new URLSearchParams(searchParams.toString());
                sp.set('month', v);
                sp.set('year', String(currentYear));
                router.push(`/hrd/attendance?${sp.toString()}`);
              }}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTH_NAMES.map((name, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={String(currentYear)}
              onValueChange={(v) => {
                const sp = new URLSearchParams(searchParams.toString());
                sp.set('year', v);
                sp.set('month', String(currentMonth));
                router.push(`/hrd/attendance?${sp.toString()}`);
              }}
            >
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2025, 2026, 2027].map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Link
              href={`/hrd/payroll-monthly`}
              className="text-xs text-muted-foreground hover:underline ml-2"
            >
              → Gaji Bulanan
            </Link>
          </div>
        )}

        <a href={exportHref} className="ml-auto">
          <Button type="button" size="sm" variant="outline" className="gap-1">
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
        </a>
      </div>

      {/* Monthly summary view */}
      {viewMode === 'monthly' && (
        <div className="space-y-4">
          {monthlyLoading ? (
            <div className="bg-card rounded-xl border p-8 text-center text-muted-foreground">Memuat…</div>
          ) : monthlyData.length === 0 ? (
            <div className="bg-card rounded-xl border p-8 text-center text-muted-foreground">
              Tidak ada data absensi untuk {MONTH_NAMES[currentMonth - 1]} {currentYear}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <SummaryCard icon={<Users className="h-4 w-4" />} label="Karyawan" value={`${monthlyData.length} orang`} />
                <SummaryCard icon={<Clock className="h-4 w-4" />} label="Total Hadir" value={`${monthlyData.reduce((s, r) => s + r.daysPresent, 0)} hari`} />
                <SummaryCard icon={<Clock className="h-4 w-4" />} label="Total Absent" value={`${monthlyData.reduce((s, r) => s + r.daysAbsent, 0)} hari`} accent={monthlyData.some(r => r.daysAbsent > 0)} />
                <SummaryCard icon={<Clock className="h-4 w-4" />} label="Total Jam" value={`${monthlyData.reduce((s, r) => s + r.totalActualHours, 0).toFixed(1)}j`} />
                <SummaryCard icon={<Clock className="h-4 w-4" />} label="Total OT" value={`${monthlyData.reduce((s, r) => s + r.totalOvertimeHours, 0).toFixed(1)}j`} accent={monthlyData.some(r => r.totalOvertimeHours > 0)} />
              </div>
              <div className="bg-card rounded-xl border overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="font-semibold text-muted-foreground">Kode</TableHead>
                      <TableHead className="font-semibold text-muted-foreground">Nama</TableHead>
                      <TableHead className="font-semibold text-muted-foreground text-center">Hadir</TableHead>
                      <TableHead className="font-semibold text-muted-foreground text-center">Absent</TableHead>
                      <TableHead className="font-semibold text-muted-foreground text-center">Cuti</TableHead>
                      <TableHead className="font-semibold text-muted-foreground text-center">Multi-Shift</TableHead>
                      <TableHead className="font-semibold text-muted-foreground text-right">Jam Aktual</TableHead>
                      <TableHead className="font-semibold text-muted-foreground text-right">Jam OT</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthlyData.map((r) => (
                      <TableRow key={r.employeeId} className="hover:bg-muted/50">
                        <TableCell className="font-medium">{r.employeeCode}</TableCell>
                        <TableCell>{r.employeeName}</TableCell>
                        <TableCell className="text-center">{r.daysPresent}</TableCell>
                        <TableCell className="text-center">
                          {r.daysAbsent > 0 ? (
                            <Badge variant="destructive" className="text-xs">{r.daysAbsent}</Badge>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">{r.daysOnLeave}</TableCell>
                        <TableCell className="text-center">{r.multiShiftDays}</TableCell>
                        <TableCell className="text-right">{r.totalActualHours.toFixed(1)}j</TableCell>
                        <TableCell className="text-right">{r.totalOvertimeHours.toFixed(1)}j</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Weekly summary view */}
      {viewMode === 'weekly' && (
        <div className="space-y-4">
          {weeklyLoading ? (
            <div className="bg-card rounded-xl border p-8 text-center text-muted-foreground">Memuat…</div>
          ) : weeklyData.length === 0 ? (
            <div className="bg-card rounded-xl border p-8 text-center text-muted-foreground">
              Tidak ada data absensi untuk minggu {weekLabel(weekBounds.start, weekBounds.end)}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <SummaryCard icon={<Users className="h-4 w-4" />} label="Karyawan" value={`${weeklyData.length} orang`} />
                <SummaryCard icon={<Clock className="h-4 w-4" />} label="Total Hadir" value={`${weeklyData.reduce((s, r) => s + r.daysPresent, 0)} shift`} />
                <SummaryCard icon={<Clock className="h-4 w-4" />} label="Total Jam" value={`${weeklyData.reduce((s, r) => s + r.totalActualHours, 0).toFixed(1)}j`} />
                <SummaryCard icon={<Clock className="h-4 w-4" />} label="Total OT" value={`${weeklyData.reduce((s, r) => s + r.totalOvertimeHours, 0).toFixed(1)}j`} accent={weeklyData.some((r) => r.totalOvertimeHours > 0)} />
                <SummaryCard icon={<Clock className="h-4 w-4" />} label="Est. Upah" value={formatIdr(weeklyData.reduce((s, r) => s + r.totalEarnings, 0))} />
              </div>
              <div className="bg-card rounded-xl border overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="font-semibold text-muted-foreground">Kode</TableHead>
                      <TableHead className="font-semibold text-muted-foreground">Nama</TableHead>
                      <TableHead className="font-semibold text-muted-foreground text-center">Hadir</TableHead>
                      <TableHead className="font-semibold text-muted-foreground text-right">Jam Aktual</TableHead>
                      <TableHead className="font-semibold text-muted-foreground text-right">Jam OT</TableHead>
                      <TableHead className="font-semibold text-muted-foreground text-right">Daily</TableHead>
                      <TableHead className="font-semibold text-muted-foreground text-right">OT Rp</TableHead>
                      <TableHead className="font-semibold text-muted-foreground text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {weeklyData.map((r) => (
                      <TableRow key={r.employeeId} className="hover:bg-muted/50">
                        <TableCell className="font-medium">{r.employeeCode}</TableCell>
                        <TableCell>{r.employeeName}</TableCell>
                        <TableCell className="text-center">{r.daysPresent}</TableCell>
                        <TableCell className="text-right">{r.totalActualHours.toFixed(1)}j</TableCell>
                        <TableCell className="text-right">{r.totalOvertimeHours.toFixed(1)}j</TableCell>
                        <TableCell className="text-right">{formatIdr(r.totalDailyEarnings)}</TableCell>
                        <TableCell className="text-right">{formatIdr(r.totalOvertimeEarnings)}</TableCell>
                        <TableCell className="text-right font-semibold">{formatIdr(r.totalEarnings)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Summary cards (daily only) */}
      {viewMode === 'daily' && summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <SummaryCard icon={<Users className="h-4 w-4" />} label="Hadir" value={`${summary.totalEmployees} orang`} />
          <SummaryCard icon={<ArrowUpDown className="h-4 w-4" />} label="Record" value={`${summary.totalRecords} shift`} />
          <SummaryCard icon={<Clock className="h-4 w-4" />} label="Multi-Shift" value={`${summary.multiShiftCount} orang`} accent={summary.multiShiftCount > 0} />
          <SummaryCard icon={<Clock className="h-4 w-4" />} label="Total Jam" value={`${summary.totalActualHours.toFixed(1)}j`} />
          <SummaryCard icon={<Clock className="h-4 w-4" />} label="Total OT" value={`${summary.totalOvertimeHours.toFixed(1)}j`} accent={summary.totalOvertimeHours > 0} />
        </div>
      )}

      {/* Table (daily only) */}
      {viewMode === 'daily' && (
      <div className="bg-card rounded-xl border overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="font-semibold text-muted-foreground">Kode</TableHead>
              <TableHead className="font-semibold text-muted-foreground">Nama</TableHead>
              <TableHead className="font-semibold text-muted-foreground">Foto</TableHead>
              <TableHead className="font-semibold text-muted-foreground">Shift</TableHead>
              <TableHead className="font-semibold text-muted-foreground">Rencana</TableHead>
              <TableHead className="font-semibold text-muted-foreground">Masuk</TableHead>
              <TableHead className="font-semibold text-muted-foreground">Pulang</TableHead>
              <TableHead className="font-semibold text-muted-foreground">Aktual</TableHead>
              <TableHead className="font-semibold text-muted-foreground">OT</TableHead>
              <TableHead className="font-semibold text-muted-foreground">Multi-OT</TableHead>
              <TableHead className="font-semibold text-muted-foreground">Source</TableHead>
              <TableHead className="font-semibold text-muted-foreground w-10">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} className="h-32 text-center text-muted-foreground">
                  Tidak ada data absensi untuk tanggal ini
                </TableCell>
              </TableRow>
            ) : (
              records.map((r) => (
                <TableRow key={r.id} className="hover:bg-muted/50">
                  <TableCell className="font-medium">{r.employeeCode}</TableCell>
                  <TableCell>{r.employeeName}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {r.clockInPhotoUrl ? (
                        <button
                          type="button"
                          className="h-9 w-9 rounded-md overflow-hidden border border-border hover:ring-2 hover:ring-primary/40"
                          onClick={() =>
                            setPhotoPreview({
                              url: r.clockInPhotoUrl!,
                              title: `${r.employeeName} — Masuk`,
                            })
                          }
                          title="Selfie masuk"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={r.clockInPhotoUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        </button>
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                      {r.clockOutPhotoUrl && (
                        <button
                          type="button"
                          className="h-9 w-9 rounded-md overflow-hidden border border-border hover:ring-2 hover:ring-primary/40 opacity-90"
                          onClick={() =>
                            setPhotoPreview({
                              url: r.clockOutPhotoUrl!,
                              title: `${r.employeeName} — Pulang`,
                            })
                          }
                          title="Selfie pulang"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={r.clockOutPhotoUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        </button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{r.shiftName}</TableCell>
                  <TableCell>{formatHours(r.plannedHours)}</TableCell>
                  <TableCell>{formatTime(r.clockInAt)}</TableCell>
                  <TableCell>{formatTime(r.clockOutAt)}</TableCell>
                  <TableCell>{formatHours(r.actualHours)}</TableCell>
                  <TableCell>
                    {r.overtimeHours > 0 ? (
                      <Badge variant="destructive" className="text-xs">+{formatHours(r.overtimeHours)}</Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {r.isOvertimeShift && (
                      <Badge className="bg-orange-500/10 text-orange-600 text-xs">YA</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{r.source}</Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={actionLoading}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openCorrect(r)}>
                          Koreksi Jam
                        </DropdownMenuItem>
                        {r.status !== 'ABSENT' && r.clockInAt === null && (
                          <DropdownMenuItem onClick={() => handleSetAbsent(r)}>
                            Tandai Tidak Hadir
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      )}

      {/* Selfie lightbox */}
      <Dialog open={!!photoPreview} onOpenChange={(open) => !open && setPhotoPreview(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{photoPreview?.title ?? 'Selfie'}</DialogTitle>
          </DialogHeader>
          {photoPreview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoPreview.url}
              alt={photoPreview.title}
              className="w-full max-h-[70vh] object-contain rounded-lg bg-black"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Correct Attendance Dialog */}
      <Dialog open={!!correcting} onOpenChange={(open) => !open && setCorrecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Koreksi Absensi — {correcting?.employeeName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="clockIn">Jam Masuk</Label>
              <Input
                id="clockIn"
                type="datetime-local"
                value={correctData.clockInAt}
                onChange={(e) => setCorrectData({ ...correctData, clockInAt: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clockOut">Jam Pulang</Label>
              <Input
                id="clockOut"
                type="datetime-local"
                value={correctData.clockOutAt}
                onChange={(e) => setCorrectData({ ...correctData, clockOutAt: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Catatan</Label>
              <Textarea
                id="notes"
                value={correctData.notes}
                onChange={(e) => setCorrectData({ ...correctData, notes: e.target.value })}
                placeholder="Alasan koreksi..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCorrecting(null)}>Batal</Button>
            <Button onClick={handleCorrect} disabled={actionLoading}>
              {actionLoading ? 'Menyimpan...' : 'Simpan Koreksi'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function toLocalInput(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
}

function SummaryCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${accent ? 'bg-primary/5 border-primary/20' : 'bg-card'}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium mb-1">
        {icon}
        {label}
      </div>
      <p className={`text-lg font-bold ${accent ? 'text-primary' : 'text-foreground'}`}>{value}</p>
    </div>
  );
}
