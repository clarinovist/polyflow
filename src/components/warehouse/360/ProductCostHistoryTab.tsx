'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { TrendingUp } from 'lucide-react';
import { listCostHistoryByProductVariant } from '@/actions/inventory/product-360';

type Row = { id: string; previousCost?: { toNumber(): number } | number | null; newCost: { toNumber(): number } | number; changePercent?: { toNumber(): number } | number | null; changeReason: string; referenceId?: string | null; createdAt: string | Date };

function toN(v: unknown){ if(v==null) return 0; if(typeof v==='number') return v; if(typeof v==='object' && 'toNumber' in (v as object)) return (v as {toNumber():number}).toNumber(); return Number(v); }
function fmtDate(d: string | Date){ return new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',year:'numeric'}).format(new Date(d)); }
function fmtIdr(n:number){ return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n); }

export function ProductCostHistoryTab({ productVariantId }: { productVariantId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); const res = await listCostHistoryByProductVariant(productVariantId); setRows(res.success ? (res.data as unknown as Row[] ?? []) : []); setLoading(false); }, [productVariantId]);
  useEffect(() => { load(); }, [load]);
  return (
    <Card>
      <CardHeader className="pb-3"><div className="flex items-center gap-3"><TrendingUp className="h-5 w-5 text-primary" /><div><CardTitle className="text-base">Riwayat Biaya (Cost History)</CardTitle><p className="text-xs text-muted-foreground">{rows.length} perubahan</p></div></div></CardHeader>
      <CardContent>
        {loading ? <p className="text-xs text-center py-8 text-muted-foreground">Memuat…</p> : rows.length===0 ? <p className="text-xs text-center py-8 text-muted-foreground">Belum ada perubahan biaya.</p> :
        <div className="overflow-x-auto"><Table><TableHeader className="bg-muted/30"><TableRow><TableHead>Tanggal</TableHead><TableHead className="text-right">Sebelumnya</TableHead><TableHead className="text-right">Baru</TableHead><TableHead className="text-right">% Change</TableHead><TableHead>Alasan</TableHead><TableHead>Ref</TableHead></TableRow></TableHeader>
        <TableBody>{rows.map(r => {
          const prev = r.previousCost ? toN(r.previousCost) : null;
          const nw = toN(r.newCost);
          const pct = r.changePercent ? toN(r.changePercent) : null;
          return <TableRow key={r.id}><TableCell className="text-sm">{fmtDate(r.createdAt)}</TableCell><TableCell className="text-right font-mono text-sm">{prev!=null ? fmtIdr(prev) : '-'}</TableCell><TableCell className="text-right font-mono text-sm font-semibold">{fmtIdr(nw)}</TableCell><TableCell className="text-right"><Badge variant="outline" className={`text-[10px] ${pct!=null && pct>10 ? 'bg-rose-500/10 text-rose-700' : pct!=null && pct<-10 ? 'bg-emerald-500/10 text-emerald-700' : ''}`}>{pct!=null?`${pct>0?'+':''}${pct.toFixed(1)}%`:'-'}</Badge></TableCell><TableCell><Badge variant="outline" className="text-[10px]">{r.changeReason}</Badge></TableCell><TableCell className="text-xs font-mono">{r.referenceId?.slice(0,8) ?? '-'}</TableCell></TableRow>;
        })}</TableBody></Table></div>}
      </CardContent>
    </Card>
  );
}
