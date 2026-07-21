'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Layers } from 'lucide-react';
import { listBatchesByProductVariant } from '@/actions/inventory/product-360';
import { formatQuantity } from '@/lib/utils/utils';

type Batch = { id: string; batchNumber: string; quantity: { toNumber(): number } | number; manufacturingDate: string | Date; expiryDate?: string | Date | null; status: string; location: { name: string } };

function toN(v: unknown){ if(v==null) return 0; if(typeof v==='number') return v; if(typeof v==='object' && 'toNumber' in (v as object)) return (v as {toNumber():number}).toNumber(); return Number(v); }
function fmtDate(d: string | Date | null | undefined){ if(!d) return '-'; return new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',year:'numeric'}).format(new Date(d)); }
function daysUntil(d: string | Date | null | undefined){ if(!d) return null; return Math.ceil((new Date(d).getTime()-Date.now())/(1000*60*60*24)); }

export function ProductBatchesTab({ productVariantId }: { productVariantId: string }) {
  const [rows, setRows] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); const res = await listBatchesByProductVariant(productVariantId); setRows(res.success ? (res.data as unknown as Batch[] ?? []) : []); setLoading(false); }, [productVariantId]);
  useEffect(() => { load(); }, [load]);
  return (
    <Card>
      <CardHeader className="pb-3"><div className="flex items-center gap-3"><Layers className="h-5 w-5 text-primary" /><div><CardTitle className="text-base">Batch & Expiry</CardTitle><p className="text-xs text-muted-foreground">{rows.length} batch</p></div></div></CardHeader>
      <CardContent>
        {loading ? <p className="text-xs text-center py-8 text-muted-foreground">Memuat…</p> : rows.length===0 ? <p className="text-xs text-center py-8 text-muted-foreground">Tidak ada batch.</p> :
        <div className="overflow-x-auto"><Table><TableHeader className="bg-muted/30"><TableRow><TableHead>Batch No</TableHead><TableHead>Lokasi</TableHead><TableHead className="text-right">Qty</TableHead><TableHead>Mfg</TableHead><TableHead>Exp</TableHead><TableHead>Sisa</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
        <TableBody>{rows.map(b => {
          const days = daysUntil(b.expiryDate);
          return <TableRow key={b.id}><TableCell className="font-mono text-sm">{b.batchNumber}</TableCell><TableCell className="text-sm">{b.location?.name ?? '-'}</TableCell><TableCell className="text-right font-mono text-sm">{formatQuantity(toN(b.quantity))}</TableCell><TableCell className="text-sm">{fmtDate(b.manufacturingDate)}</TableCell><TableCell className="text-sm">{fmtDate(b.expiryDate)}</TableCell><TableCell>{days!=null ? <Badge variant="outline" className={`text-[10px] ${days<0?'bg-rose-500/10 text-rose-700': days<=30?'bg-amber-500/10 text-amber-700':'bg-emerald-500/10 text-emerald-700'}`}>{days<0?`Exp ${Math.abs(days)} hari lalu`:`${days} hari`}</Badge> : '-'}</TableCell><TableCell><Badge variant="outline" className="text-[10px]">{b.status}</Badge></TableCell></TableRow>;
        })}</TableBody></Table></div>}
      </CardContent>
    </Card>
  );
}
