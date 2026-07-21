'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Warehouse } from 'lucide-react';
import { listStockByLocation } from '@/actions/inventory/product-360';
import { formatQuantity } from '@/lib/utils/utils';

type Inv = { id: string; quantity: { toNumber(): number } | number; averageCost?: { toNumber(): number } | number | null; location: { id: string; name: string; slug: string; locationType?: string } };

function toN(v: unknown){ if(v==null) return 0; if(typeof v==='number') return v; if(typeof v==='object' && 'toNumber' in (v as object)) return (v as {toNumber():number}).toNumber(); return Number(v); }
function fmtIdr(n:number){ return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n); }

export function ProductStockByLocationTab({ productVariantId }: { productVariantId: string }) {
  const [rows, setRows] = useState<Inv[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); const res = await listStockByLocation(productVariantId); setRows(res.success ? (res.data as unknown as Inv[] ?? []) : []); setLoading(false); }, [productVariantId]);
  useEffect(() => { load(); }, [load]);
  const totalQty = rows.reduce((s,r)=>s+toN(r.quantity),0);
  const totalVal = rows.reduce((s,r)=>s+toN(r.quantity)*toN(r.averageCost),0);
  return (
    <Card>
      <CardHeader className="pb-3"><div className="flex items-center gap-3"><Warehouse className="h-5 w-5 text-primary" /><div><CardTitle className="text-base">Stok per Lokasi</CardTitle><p className="text-xs text-muted-foreground">{rows.length} lokasi · total {formatQuantity(totalQty)} · value {fmtIdr(totalVal)}</p></div></div></CardHeader>
      <CardContent>
        {loading ? <p className="text-xs text-center py-8 text-muted-foreground">Memuat…</p> : rows.length===0 ? <p className="text-xs text-center py-8 text-muted-foreground">Tidak ada stok di lokasi manapun.</p> :
        <div className="overflow-x-auto"><Table><TableHeader className="bg-muted/30"><TableRow><TableHead>Lokasi</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Avg Cost</TableHead><TableHead className="text-right">Value</TableHead></TableRow></TableHeader><TableBody>{rows.map(r => <TableRow key={r.id}><TableCell className="text-sm">{r.location.name}<span className="text-xs text-muted-foreground ml-1">({r.location.slug})</span></TableCell><TableCell className="text-right font-mono text-sm">{formatQuantity(toN(r.quantity))}</TableCell><TableCell className="text-right font-mono text-sm">{r.averageCost ? fmtIdr(toN(r.averageCost)) : '-'}</TableCell><TableCell className="text-right font-mono text-sm font-semibold">{fmtIdr(toN(r.quantity)*toN(r.averageCost))}</TableCell></TableRow>)}</TableBody></Table></div>}
      </CardContent>
    </Card>
  );
}
