'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { FileClock } from 'lucide-react';
import { listRecentMovementsByProductVariant } from '@/actions/inventory/product-360';
import { formatQuantity } from '@/lib/utils/utils';

type Move = { id: string; type: string; quantity: { toNumber(): number } | number; reference?: string | null; createdAt: string | Date; fromLocation?: { name: string } | null; toLocation?: { name: string } | null };

function toN(v: unknown){ if(v==null) return 0; if(typeof v==='number') return v; if(typeof v==='object' && 'toNumber' in (v as object)) return (v as {toNumber():number}).toNumber(); return Number(v); }
function fmtDate(d: string | Date){ return new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(d)); }

export function ProductMovementsTab({ productVariantId }: { productVariantId: string }) {
  const [rows, setRows] = useState<Move[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); const res = await listRecentMovementsByProductVariant(productVariantId); setRows(res.success ? (res.data as unknown as Move[] ?? []) : []); setLoading(false); }, [productVariantId]);
  useEffect(() => { load(); }, [load]);
  return (
    <Card>
      <CardHeader className="pb-3"><div className="flex items-center gap-3"><FileClock className="h-5 w-5 text-primary" /><div><CardTitle className="text-base">Movement Terbaru (50)</CardTitle><p className="text-xs text-muted-foreground">Transfer, in, out</p></div></div></CardHeader>
      <CardContent>
        {loading ? <p className="text-xs text-center py-8 text-muted-foreground">Memuat…</p> : rows.length===0 ? <p className="text-xs text-center py-8 text-muted-foreground">Tidak ada movement.</p> :
        <div className="overflow-x-auto"><Table><TableHeader className="bg-muted/30"><TableRow><TableHead>Tanggal</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Qty</TableHead><TableHead>From → To</TableHead><TableHead>Ref</TableHead></TableRow></TableHeader>
        <TableBody>{rows.map(m => <TableRow key={m.id}><TableCell className="text-xs">{fmtDate(m.createdAt)}</TableCell><TableCell><Badge variant="outline" className="text-[10px]">{m.type}</Badge></TableCell><TableCell className="text-right font-mono text-sm">{formatQuantity(toN(m.quantity))}</TableCell><TableCell className="text-xs">{m.fromLocation?.name ?? '-'} → {m.toLocation?.name ?? '-'}</TableCell><TableCell className="text-xs font-mono">{m.reference?.slice(0,20) ?? '-'}</TableCell></TableRow>)}</TableBody></Table></div>}
      </CardContent>
    </Card>
  );
}
