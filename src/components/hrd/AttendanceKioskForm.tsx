'use client';

import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Clock, LogIn, LogOut, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import {
  kioskClockIn,
  kioskClockOut,
  type KioskEmployeeOption,
} from '@/actions/admin/attendance';
import { cn } from '@/lib/utils/utils';
import { EmployeeNameSearch } from '@/components/hrd/EmployeeNameSearch';
import { LiveSelfieCapture } from '@/components/hrd/LiveSelfieCapture';

interface Shift {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  plannedHours: number | null;
}

interface Feedback {
  type: 'success' | 'error';
  message: string;
}

interface LogEntry {
  id: number;
  employeeCode: string;
  shiftName: string;
  isOvertime: boolean;
  message: string;
  time: string;
}

interface Props {
  shifts: Shift[];
  employees: KioskEmployeeOption[];
}

function getPlannedLabel(s: Shift): string {
  const h = s.plannedHours ?? '?';
  return `${h}j`;
}

function nowWIB(): string {
  return new Date().toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Jakarta',
  });
}

async function uploadSelfie(
  file: File,
  employeeId: string,
  kind: 'clock_in' | 'clock_out',
): Promise<string | null> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('employeeId', employeeId);
  formData.append('kind', kind);
  const res = await fetch('/api/upload/attendance-photo', { method: 'POST', body: formData });
  if (!res.ok) return null;
  const data = (await res.json()) as { success?: boolean; publicUrl?: string };
  return data.publicUrl ?? null;
}

export function AttendanceKioskForm({ shifts, employees }: Props) {
  const [selectedShift, setSelectedShift] = useState<string>(shifts[0]?.id ?? '');
  const [selectedEmployee, setSelectedEmployee] = useState<KioskEmployeeOption | null>(null);
  const [pin, setPin] = useState('');
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [selfieKey, setSelfieKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logId, setLogId] = useState(0);

  const addLog = (code: string, shiftName: string, isOvertime: boolean, message: string) => {
    setLogId((prev) => prev + 1);
    setLogs((prev) =>
      [
        { id: logId, employeeCode: code, shiftName, isOvertime, message, time: nowWIB() },
        ...prev,
      ].slice(0, 20),
    );
  };

  const resetForm = useCallback(() => {
    setSelectedEmployee(null);
    setPin('');
    setSelfieFile(null);
    setSelfieKey((k) => k + 1);
  }, []);

  const handleSelfieCapture = useCallback((file: File | null) => {
    setSelfieFile(file);
  }, []);

  const handleClockIn = async () => {
    if (!selectedEmployee) {
      setFeedback({ type: 'error', message: 'Pilih karyawan dulu' });
      return;
    }
    if (!pin.trim()) {
      setFeedback({ type: 'error', message: 'Masukkan PIN' });
      return;
    }
    if (!selfieFile) {
      setFeedback({ type: 'error', message: 'Ambil selfie terlebih dahulu' });
      return;
    }
    if (!selectedShift) {
      setFeedback({ type: 'error', message: 'Pilih shift' });
      return;
    }

    setLoading(true);
    setFeedback(null);
    try {
      const photoUrl = await uploadSelfie(selfieFile, selectedEmployee.id, 'clock_in');
      if (!photoUrl) {
        setFeedback({ type: 'error', message: 'Gagal upload selfie. Coba lagi.' });
        return;
      }

      const result = await kioskClockIn(
        selectedEmployee.code,
        pin,
        selectedShift,
        photoUrl,
      );
      if (result.success && result.data) {
        const d = result.data;
        const shiftName = shifts.find((s) => s.id === selectedShift)?.name ?? '';
        const msg = d.isOvertimeShift
          ? `${d.employeeName} · LEMBUR · ${shiftName}`
          : `${d.employeeName} · ${shiftName} · ${nowWIB()}`;
        setFeedback({ type: 'success', message: msg });
        addLog(d.employeeCode, shiftName, d.isOvertimeShift, 'MASUK');
        resetForm();
      } else {
        setFeedback({ type: 'error', message: result.error || 'Gagal clock-in' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Terjadi kesalahan' });
    } finally {
      setLoading(false);
    }
  };

  const handleClockOut = async () => {
    if (!selectedEmployee) {
      setFeedback({ type: 'error', message: 'Pilih karyawan dulu' });
      return;
    }
    if (!pin.trim()) {
      setFeedback({ type: 'error', message: 'Masukkan PIN' });
      return;
    }

    setLoading(true);
    setFeedback(null);
    try {
      let photoUrl: string | undefined;
      if (selfieFile) {
        photoUrl = (await uploadSelfie(selfieFile, selectedEmployee.id, 'clock_out')) || undefined;
      }

      const result = await kioskClockOut(selectedEmployee.code, pin, photoUrl);
      if (result.success && result.data) {
        const d = result.data;
        const ot = d.overtimeHours > 0 ? ` · +${d.overtimeHours}h lembur jam` : '';
        setFeedback({
          type: 'success',
          message: `${d.employeeName} pulang ${d.actualHours?.toFixed(1)}j${ot}`,
        });
        addLog(d.employeeCode, d.shiftName, false, 'PULANG');
        resetForm();
      } else {
        setFeedback({ type: 'error', message: result.error || 'Gagal clock-out' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Terjadi kesalahan' });
    } finally {
      setLoading(false);
    }
  };

  const canClockIn = !!selectedEmployee && !!pin.trim() && !!selfieFile && !!selectedShift && !loading;
  const canClockOut = !!selectedEmployee && !!pin.trim() && !loading;

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-black tracking-tight uppercase">Absensi</h1>
        <div className="bg-muted px-4 py-2 rounded-full flex items-center gap-2 text-sm font-medium border">
          <Clock className="h-4 w-4 text-primary" />
          {nowWIB()} WIB
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {shifts.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSelectedShift(s.id)}
            className={cn(
              'px-4 py-2 rounded-full text-sm font-bold border-2 transition-all',
              selectedShift === s.id
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card text-muted-foreground border-border hover:border-primary/50',
            )}
          >
            {s.name} <span className="opacity-70 ml-1">{getPlannedLabel(s)}</span>
          </button>
        ))}
      </div>

      <div className="bg-card rounded-2xl border-2 p-4 md:p-6 space-y-4">
        <EmployeeNameSearch
          employees={employees}
          selected={selectedEmployee}
          onSelect={setSelectedEmployee}
          disabled={loading}
        />

        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 block">
            PIN
          </label>
          <Input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="••••"
            className="h-14 text-lg font-bold tracking-[0.5em]"
            maxLength={6}
            autoComplete="off"
            disabled={loading}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canClockIn) void handleClockIn();
            }}
          />
        </div>

        <LiveSelfieCapture
          key={selfieKey}
          onCapture={handleSelfieCapture}
          disabled={loading}
          label="Selfie (wajib untuk MASUK)"
        />

        <div className="grid grid-cols-2 gap-3">
          <Button
            size="lg"
            className="h-16 text-lg font-black uppercase tracking-wider"
            onClick={() => void handleClockIn()}
            disabled={!canClockIn}
          >
            {loading ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <LogIn className="mr-2 h-5 w-5" />
            )}
            MASUK
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-16 text-lg font-black uppercase tracking-wider border-2"
            onClick={() => void handleClockOut()}
            disabled={!canClockOut}
          >
            {loading ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <LogOut className="mr-2 h-5 w-5" />
            )}
            PULANG
          </Button>
        </div>
        <p className="text-xs text-muted-foreground text-center">
          MASUK wajib selfie kamera live · PULANG selfie opsional · PIN wajib
        </p>
      </div>

      {feedback && (
        <div
          className={cn(
            'flex items-center gap-3 p-4 rounded-xl border-2 text-sm font-medium',
            feedback.type === 'success'
              ? 'bg-green-500/5 border-green-500/20 text-green-700'
              : 'bg-destructive/5 border-destructive/20 text-destructive',
          )}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {logs.length > 0 && (
        <div className="bg-card rounded-xl border p-3 space-y-1 max-h-64 overflow-y-auto">
          {logs.map((l) => (
            <div
              key={l.id}
              className="flex items-center gap-3 text-sm py-1 border-b border-border/50 last:border-0"
            >
              <span className="text-muted-foreground font-mono text-xs w-12">{l.time}</span>
              <Badge variant={l.message === 'MASUK' ? 'default' : 'secondary'} className="text-xs">
                {l.message}
              </Badge>
              <span className="font-medium">{l.employeeCode}</span>
              <span className="text-muted-foreground">· {l.shiftName}</span>
              {l.isOvertime && (
                <Badge className="bg-orange-500/10 text-orange-600 text-xs">LEMBUR</Badge>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
