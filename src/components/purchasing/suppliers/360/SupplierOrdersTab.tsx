'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ShoppingCart } from 'lucide-react';
import { listPurchaseOrdersBySupplier } from '@/actions/purchasing/supplier-360';
import Link from 'next/link';

type Row = { id: string; orderNumber: string; orderDate: string | Date; expectedDate?: string | Date | null; status: string; totalAmount?: { toNumber(): number } | number | null; items: { receivedQty: { toNumber(): number } | number; quantity: { toNumber(): number } | number }[] };

function fmtDate(d: string | Date | null | undefined){ if(!d) return '-'; return new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',year:'numeric'}).format(new Date(d)); }
function toN(v:unknown){ if(v==null) return 0; if(typeof v==='number') return v; if(typeof v==='object' && 'toNumber' in (v as object)) return (v as {toNumber():number}).toNumber(); return Number(v); }
function fmtIdr(n:number){ return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n); }

export function SupplierOrdersTab({ supplierId }: { supplierId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); const res = await listPurchaseOrdersBySupplier(supplierId); setRows(res.success ? (res.data as unknown as Row[] ?? []) : []); setLoading(false); }, [supplierId]);
  useEffect(() => { load(); }, [load]);

  return (
    <Card>
      <CardHeader className="pb-3"><div className="flex items-center gap-3"><ShoppingCart className="h-5 w-5 text-primary" /><div><CardTitle className="text-base">Purchase Orders</CardTitle><p className="text-xs text-muted-foreground">{rows.length} PO</p></div></div></CardHeader>
      <CardContent>
        {loading ? <p className="text-xs text-center py-8 text-muted-foreground">Memuat…</p> : rows.length===0 ? <p className="text-xs text-center py-8 text-muted-foreground">Belum ada PO.</p> :
        <div className="overflow-x-auto"><Table><TableHeader className="bg-muted/30"><TableRow><TableHead>No. PO</TableHead><TableHead>Tanggal</TableHead><TableHead>Expected</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Status</TableHead><TableHead>Receive %</TableHead></TableRow></TableHeader>
        <TableBody>{rows.map(r => {
          const totalReceived = r.items.reduce((s,i)=>s+toN(i.receivedQty),0);
          const totalQty = r.items.reduce((s,i)=>s+toN(i.quantity),0);
          const pct = totalQty>0 ? Math.round((totalReceived/totalQty)*100) : 0;
          return <TableRow key={r.id}><TableCell className="font-mono text-sm"><Link href={`/purchasing/orders/${r.id}`} className="hover:underline text-primary">{r.orderNumber}</Link></TableCell><TableCell className="text-sm">{fmtDate(r.orderDate)}</TableCell><TableCell className="text-sm">{fmtDate(r.expectedDate)}</TableCell><TableCell className="text-right font-mono text-sm">{r.totalAmount?fmtIdr(toN(r.totalAmount)):'-'}</TableCell><TableCell><Badge variant="outline" className="text-[10px]">{r.status}</Badge></TableCell><TableCell className="text-sm">{pct}%</TableCell></TableRow>;
        })}</TableBody></Table></div>}
      </CardContent>
    </Card>
  );
}
