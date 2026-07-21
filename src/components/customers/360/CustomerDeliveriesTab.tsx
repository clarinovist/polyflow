'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Truck } from 'lucide-react';
import { listCustomerDeliveries } from '@/actions/sales/customer-360';
import Link from 'next/link';

type Row = { id: string; deliveryNumber?: string; doNumber?: string; deliveryDate: string | Date; status: string; items?: { id: string }[] };

function fmtDate(d: string | Date) { return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d)); }

export function CustomerDeliveriesTab({ customerId }: { customerId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); const res = await listCustomerDeliveries(customerId); setRows(res.success ? (res.data as unknown as Row[] ?? []) : []); setLoading(false); }, [customerId]);
  useEffect(() => { load(); }, [load]);
  return (
    <Card>
      <CardHeader className="pb-3"><div className="flex items-center gap-3"><Truck className="h-5 w-5 text-primary" /><div><CardTitle className="text-base">Pengiriman</CardTitle><p className="text-xs text-muted-foreground">{rows.length} DO</p></div></div></CardHeader>
      <CardContent>
        {loading ? <p className="text-xs text-center py-8 text-muted-foreground">Memuat…</p> : rows.length===0 ? <p className="text-xs text-center py-8 text-muted-foreground">Belum ada pengiriman.</p> :
        <div className="overflow-x-auto"><Table><TableHeader className="bg-muted/30"><TableRow><TableHead>No. DO</TableHead><TableHead>Tanggal</TableHead><TableHead>Items</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
        <TableBody>{rows.map(r => <TableRow key={r.id}><TableCell className="font-mono text-sm"><Link href={`/sales/deliveries/${r.id}`} className="hover:underline text-primary">{r.deliveryNumber || r.doNumber || r.id.slice(0,8)}</Link></TableCell><TableCell className="text-sm">{fmtDate(r.deliveryDate)}</TableCell><TableCell className="text-sm">{r.items?.length ?? '-'}</TableCell><TableCell><Badge variant="outline" className="text-[10px]">{r.status}</Badge></TableCell></TableRow>)}</TableBody></Table></div>}
      </CardContent>
    </Card>
  );
}
