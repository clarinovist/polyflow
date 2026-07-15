'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Clock, LogIn, LogOut, AlertCircle, CheckCircle2 } from 'lucide-react';
import { kioskClockIn, kioskClockOut } from '@/actions/admin/attendance';
import { cn } from '@/lib/utils/utils';

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
  details?: string;
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
}

function getPlannedLabel(s: Shift): string {
  const h = s.plannedHours ?? '?';
  return `${h}j`;
}

function nowWIB(): string {
  return new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' });
}

export function AttendanceKioskForm({ shifts }: Props) {
  const [selectedShift, setSelectedShift] = useState<string>(shifts[0]?.id ?? '');
  const [employeeCode, setEmployeeCode] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logId, setLogId] = useState(0);

  const addLog = (code: string, shiftName: string, isOvertime: boolean, message: string) => {
    setLogId(prev => prev + 1);
    setLogs(prev => [{ id: logId, employeeCode: code, shiftName, isOvertime, message, time: nowWIB() }, ...prev].slice(0, 20));
  };

  const handleClockIn = async () => {
    if (!employeeCode.trim() || !pin.trim()) {
      setFeedback({ type: 'error', message: 'Masukkan kode dan PIN' });
      return;
    }
    setLoading(true);
    setFeedback(null);
    try {
      const result = await kioskClockIn(employeeCode.trim(), pin, selectedShift);
      if (result.success && result.data) {
        const d = result.data;
        const shiftName = shifts.find(s => s.id === selectedShift)?.name ?? '';
        const msg = d.isOvertimeShift
          ? `${d.employeeName} · LEMBUR · ${shiftName}`
          : `${d.employeeName} · ${shiftName} · ${nowWIB()}`;
        setFeedback({ type: 'success', message: msg });
        addLog(d.employeeCode, shiftName, d.isOvertimeShift, 'MASUK');
      } else {
        setFeedback({ type: 'error', message: result.error || 'Gagal clock-in' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Terjadi kesalahan' });
    } finally {
      setEmployeeCode('');
      setPin('');
      setLoading(false);
    }
  };

  const handleClockOut = async () => {
    if (!employeeCode.trim() || !pin.trim()) {
      setFeedback({ type: 'error', message: 'Masukkan kode dan PIN' });
      return;
    }
    setLoading(true);
    setFeedback(null);
    try {
      const result = await kioskClockOut(employeeCode.trim(), pin);
      if (result.success && result.data) {
        const d = result.data;
        const ot = d.overtimeHours > 0 ? ` · +${d.overtimeHours}h lembur jam` : '';
        setFeedback({ type: 'success', message: `${d.employeeName} pulang ${d.actualHours?.toFixed(1)}j${ot}` });
        addLog(d.employeeCode, d.shiftName, false, 'PULANG');
      } else {
        setFeedback({ type: 'error', message: result.error || 'Gagal clock-out' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Terjadi kesalahan' });
    } finally {
      setEmployeeCode('');
      setPin('');
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-black tracking-tight uppercase">Absensi</h1>
        <div className="bg-muted px-4 py-2 rounded-full flex items-center gap-2 text-sm font-medium border">
          <Clock className="h-4 w-4 text-primary" />
          {nowWIB()} WIB
        </div>
      </div>

      {/* Shift chips */}
      <div className="flex flex-wrap gap-2">
        {shifts.map(s => (
          <button
            key={s.id}
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

      {/* Input area */}
      <div className="bg-card rounded-2xl border-2 p-4 md:p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Kode Karyawan</label>
            <Input
              value={employeeCode}
              onChange={e => setEmployeeCode(e.target.value)}
              placeholder="EMP-001"
              className="h-14 text-lg font-bold uppercase"
              autoComplete="off"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 block">PIN</label>
            <Input
              type="password"
              value={pin}
              onChange={e => setPin(e.target.value)}
              placeholder="••••"
              className="h-14 text-lg font-bold tracking-[0.5em]"
              maxLength={6}
              autoComplete="off"
              onKeyDown={e => {
                if (e.key === 'Enter') handleClockIn();
              }}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Button
            size="lg"
            className="h-16 text-lg font-black uppercase tracking-wider"
            onClick={handleClockIn}
            disabled={loading}
          >
            <LogIn className="mr-2 h-5 w-5" />
            MASUK
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-16 text-lg font-black uppercase tracking-wider border-2"
            onClick={handleClockOut}
            disabled={loading}
          >
            <LogOut className="mr-2 h-5 w-5" />
            PULANG
          </Button>
        </div>
      </div>

      {/* Feedback */}
      {feedback && (
        <div className={cn(
          'flex items-center gap-3 p-4 rounded-xl border-2 text-sm font-medium',
          feedback.type === 'success' ? 'bg-green-500/5 border-green-500/20 text-green-700' : 'bg-destructive/5 border-destructive/20 text-destructive',
        )}>
          {feedback.type === 'success' ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <AlertCircle className="h-5 w-5 shrink-0" />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Log */}
      {logs.length > 0 && (
        <div className="bg-card rounded-xl border p-3 space-y-1 max-h-64 overflow-y-auto">
          {logs.map(l => (
            <div key={l.id} className="flex items-center gap-3 text-sm py-1 border-b border-border/50 last:border-0">
              <span className="text-muted-foreground font-mono text-xs w-12">{l.time}</span>
              <Badge variant={l.message === 'MASUK' ? 'default' : 'secondary'} className="text-xs">{l.message}</Badge>
              <span className="font-medium">{l.employeeCode}</span>
              <span className="text-muted-foreground">· {l.shiftName}</span>
              {l.isOvertime && <Badge className="bg-orange-500/10 text-orange-600 text-xs">LEMBUR</Badge>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
