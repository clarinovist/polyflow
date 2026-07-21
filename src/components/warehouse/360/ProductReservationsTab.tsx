'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ListOrdered } from 'lucide-react';
import { getProduct360Overview } from '@/actions/inventory/product-360';
import { formatQuantity } from '@/lib/utils/utils';

type Res = { id: string; quantity: { toNumber(): number } | number; reservedFor: string; referenceId: string; reservedUntil?: string | Date | null; status: string; createdAt: string | Date };

function toN(v: unknown){ if(v==null) return 0; if(typeof v==='number') return v; if(typeof v==='object' && 'toNumber' in (v as object)) return (v as {toNumber():number}).toNumber(); return Number(v); }
function fmtDate(d: string | Date | null | undefined){ if(!d) return '-'; return new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',year:'numeric'}).format(new Date(d)); }

export function ProductReservationsTab({ productVariantId }: { productVariantId: string }) {
  const [rows, setRows] = useState<Res[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); const res = await getProduct360Overview(productVariantId); const r = (res.success ? (res.data as unknown as { reservations: Res[] })?.reservations : []) ?? []; setRows(r); setLoading(false); }, [productVariantId]);
  useEffect(() => { load(); }, [load]);
  return (
    <Card>
      <CardHeader className="pb-3"><div className="flex items-center gap-3"><ListOrdered className="h-5 w-5 text-primary" /><div><CardTitle className="text-base">Reservasi Aktif</CardTitle><p className="text-xs text-muted-foreground">{rows.length} reservasi</p></div></div></CardHeader>
      <CardContent>
        {loading ? <p className="text-xs text-center py-8 text-muted-foreground">Memuat…</p> : rows.length===0 ? <p className="text-xs text-center py-8 text-muted-foreground">Tidak ada reservasi aktif.</p> :
        <div className="overflow-x-auto"><Table><TableHeader className="bg-muted/30"><TableRow><TableHead>Tanggal</TableHead><TableHead>Untuk</TableHead><TableHead>Ref</TableHead><TableHead className="text-right">Qty</TableHead><TableHead>Until</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
        <TableBody>{rows.map(r => <TableRow key={r.id}><TableCell className="text-sm">{fmtDate(r.createdAt)}</TableCell><TableCell className="text-sm">{r.reservedFor}</TableCell><TableCell className="font-mono text-xs">{r.referenceId.slice(0,8)}</TableCell><TableCell className="text-right font-mono text-sm">{formatQuantity(toN(r.quantity))}</TableCell><TableCell className="text-sm">{fmtDate(r.reservedUntil)}</TableCell><TableCell><Badge variant="outline" className="text-[10px]">{r.status}</Badge></TableCell></TableRow>)}</TableBody></Table></div>}
      </CardContent>
    </Card>
  );
}
