'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, Gavel } from 'lucide-react';
import { listDisciplinaryActions, listLeaveRequests } from '@/actions/hrd/disciplinary-leave';

type Discipline = {
  id: string;
  type: string;
  reason: string;
  effectiveDate: string | Date;
  expiryDate: string | Date | null;
  documentUrl?: string | null;
};

type Leave = {
  id: string;
  type: string;
  status: string;
  startDate: string | Date;
  endDate: string | Date;
  reason: string | null;
};

const LEAVE_TYPES: Record<string, string> = {
  ANNUAL: 'Tahunan', SICK: 'Sakit', PERMISSION: 'Izin', MATERNITY: 'Melahirkan', UNPAID: 'Tanpa Gaji', OTHER: 'Lainnya',
};
const LEAVE_STATUS: Record<string, string> = {
  PENDING: 'bg-amber-500/10 text-amber-700', APPROVED: 'bg-emerald-500/10 text-emerald-700', REJECTED: 'bg-rose-500/10 text-rose-700',
};
const DISC_TYPES: Record<string, string> = {
  VERBAL_WARNING: 'Teguran Lisan', SP1: 'SP1', SP2: 'SP2', SP3: 'SP3', SUSPENSION: 'Skorsing', OTHER: 'Lainnya',
};

function fmt(d: string | Date): string {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d));
}

interface Props {
  employeeId: string;
}

export function Employee360LeaveDisciplineTab({ employeeId }: Props) {
  const [disciplines, setDisciplines] = useState<Discipline[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [dRes, lRes] = await Promise.all([
      listDisciplinaryActions(employeeId),
      listLeaveRequests({ employeeId }),
    ]);
    setDisciplines(dRes.success ? ((dRes.data ?? []) as unknown as Discipline[]) : []);
    setLeaves(lRes.success ? ((lRes.data ?? []) as unknown as Leave[]) : []);
    setLoading(false);
  }, [employeeId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      {/* Cuti */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-3">
            <CalendarDays className="h-5 w-5 text-primary" />
            <CardTitle className="text-sm">Riwayat Cuti & Izin</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-xs text-muted-foreground text-center py-8">Memuat…</p>
          ) : leaves.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">Belum ada cuti/izin tercatat.</p>
          ) : (
            <div className="space-y-2">
              {leaves.map((l) => (
                <div key={l.id} className="border-b border-border/50 py-2 flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-sm">
                      {LEAVE_TYPES[l.type] || l.type}
                      <span className="mx-1">·</span>
                      {fmt(l.startDate)} — {fmt(l.endDate)}
                    </div>
                    {l.reason && <div className="text-xs text-muted-foreground mt-0.5">{l.reason}</div>}
                  </div>
                  <Badge variant="outline" className={`text-[10px] shrink-0 ${LEAVE_STATUS[l.status] || ''}`}>{l.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Disiplin */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-3">
            <Gavel className="h-5 w-5 text-primary" />
            <CardTitle className="text-sm">Riwayat Disiplin</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-xs text-muted-foreground text-center py-8">Memuat…</p>
          ) : disciplines.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">Belum ada sanksi.</p>
          ) : (
            <div className="space-y-2">
              {disciplines.map((d) => (
                <div key={d.id} className="border-b border-border/50 py-2">
                  <div className="font-medium text-sm">
                    {DISC_TYPES[d.type] || d.type}
                    <span className="mx-1">·</span>
                    {fmt(d.effectiveDate)}
                    {d.expiryDate ? ` → ${fmt(d.expiryDate)}` : ''}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{d.reason}</div>
                  {d.documentUrl && (
                    <a href={d.documentUrl} target="_blank" rel="noreferrer" className="text-xs underline text-primary">
                      Lihat dokumen
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
