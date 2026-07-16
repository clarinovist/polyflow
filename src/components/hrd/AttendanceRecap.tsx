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
import { Clock, Users, ArrowUpDown, MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useState } from 'react';
import { toast } from 'sonner';
import { setAbsent, correctAttendance } from '@/actions/admin/attendance';

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

export function AttendanceRecap({ records, summary, shifts, currentDate, currentShift, overtimeOnly }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [correcting, setCorrecting] = useState<AttendanceRecord | null>(null);
  const [correctData, setCorrectData] = useState({ clockInAt: '', clockOutAt: '', notes: '' });
  const [actionLoading, setActionLoading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<{ url: string; title: string } | null>(null);

  const updateParam = (key: string, value: string | null) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (value) sp.set(key, value);
    else sp.delete(key);
    router.push(`/hrd/attendance?${sp.toString()}`);
  };

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
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <SummaryCard icon={<Users className="h-4 w-4" />} label="Hadir" value={`${summary.totalEmployees} orang`} />
          <SummaryCard icon={<ArrowUpDown className="h-4 w-4" />} label="Record" value={`${summary.totalRecords} shift`} />
          <SummaryCard icon={<Clock className="h-4 w-4" />} label="Multi-Shift" value={`${summary.multiShiftCount} orang`} accent={summary.multiShiftCount > 0} />
          <SummaryCard icon={<Clock className="h-4 w-4" />} label="Total Jam" value={`${summary.totalActualHours.toFixed(1)}j`} />
          <SummaryCard icon={<Clock className="h-4 w-4" />} label="Total OT" value={`${summary.totalOvertimeHours.toFixed(1)}j`} accent={summary.totalOvertimeHours > 0} />
        </div>
      )}

      {/* Table */}
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
