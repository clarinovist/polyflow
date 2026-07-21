'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Undo2 } from 'lucide-react';
import { listCustomerReturns } from '@/actions/sales/customer-360';
import Link from 'next/link';

type Ret = { id: string; returnNumber: string; returnDate: string | Date; totalAmount?: { toNumber(): number } | number | null; status: string; reason?: string | null };

function fmtDate(d: string | Date) { return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d)); }
function toN(v: unknown){ if(v==null) return 0; if(typeof v==='number') return v; if(typeof v==='object' && 'toNumber' in (v as object)) return (v as {toNumber():number}).toNumber(); return Number(v); }
function fmtIdr(n:number){ return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n); }

export function CustomerReturnsTab({ customerId }: { customerId: string }) {
  const [rows, setRows] = useState<Ret[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); const res = await listCustomerReturns(customerId); setRows(res.success ? (res.data as unknown as Ret[] ?? []) : []); setLoading(false); }, [customerId]);
  useEffect(() => { load(); }, [load]);
  return (
    <Card>
      <CardHeader className="pb-3"><div className="flex items-center gap-3"><Undo2 className="h-5 w-5 text-primary" /><div><CardTitle className="text-base">Retur Penjualan</CardTitle><p className="text-xs text-muted-foreground">{rows.length} retur</p></div></div></CardHeader>
      <CardContent>
        {loading ? <p className="text-xs text-center py-8 text-muted-foreground">Memuat…</p> : rows.length===0 ? <p className="text-xs text-center py-8 text-muted-foreground">Belum ada retur.</p> :
        <div className="overflow-x-auto"><Table><TableHeader className="bg-muted/30"><TableRow><TableHead>No. Retur</TableHead><TableHead>Tanggal</TableHead><TableHead>Total</TableHead><TableHead>Alasan</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
        <TableBody>{rows.map(r => <TableRow key={r.id}><TableCell className="font-mono text-sm"><Link href={`/sales/returns/${r.id}`} className="hover:underline text-primary">{r.returnNumber}</Link></TableCell><TableCell className="text-sm">{fmtDate(r.returnDate)}</TableCell><TableCell className="text-sm font-mono">{r.totalAmount ? fmtIdr(toN(r.totalAmount)) : '-'}</TableCell><TableCell className="text-sm">{r.reason ?? '-'}</TableCell><TableCell><Badge variant="outline" className="text-[10px]">{r.status}</Badge></TableCell></TableRow>)}</TableBody></Table></div>}
      </CardContent>
    </Card>
  );
}
