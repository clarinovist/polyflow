'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin } from 'lucide-react';
import { listCustomerVisits } from '@/actions/sales/customer-360';

type Visit = { id: string; checkInTime: string | Date; checkOutTime?: string | Date | null; notes?: string | null; latitude?: number | null; longitude?: number | null; user?: { name?: string | null; email?: string | null } | null; };

function fmtDate(d: string | Date){ return new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(d)); }

export function CustomerVisitsTab({ customerId }: { customerId: string }) {
  const [rows, setRows] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); const res = await listCustomerVisits(customerId); setRows(res.success ? (res.data as unknown as Visit[] ?? []) : []); setLoading(false); }, [customerId]);
  useEffect(() => { load(); }, [load]);
  return (
    <Card>
      <CardHeader className="pb-3"><div className="flex items-center gap-3"><MapPin className="h-5 w-5 text-primary" /><div><CardTitle className="text-base">Kunjungan Sales</CardTitle><p className="text-xs text-muted-foreground">{rows.length} kunjungan</p></div></div></CardHeader>
      <CardContent className="space-y-3">
        {loading ? <p className="text-xs text-center py-8 text-muted-foreground">Memuat…</p> : rows.length===0 ? <p className="text-xs text-center py-8 text-muted-foreground">Belum ada kunjungan.</p> :
        rows.map(v => (
          <div key={v.id} className="border-b border-border/50 py-3 flex justify-between gap-3">
            <div>
              <div className="font-medium text-sm">{fmtDate(v.checkInTime)} {v.user?.name ? `· ${v.user.name}` : ''}</div>
              {v.notes && <div className="text-xs text-muted-foreground mt-0.5">{v.notes}</div>}
              {(v.latitude!=null && v.longitude!=null) && <a href={`https://www.google.com/maps?q=${v.latitude},${v.longitude}`} target="_blank" rel="noreferrer" className="text-xs text-primary underline inline-flex items-center gap-1 mt-1">GPS {Number(v.latitude).toFixed(5)}, {Number(v.longitude).toFixed(5)}</a>}
            </div>
            <Badge variant="outline" className="text-[10px] shrink-0">Visit</Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
