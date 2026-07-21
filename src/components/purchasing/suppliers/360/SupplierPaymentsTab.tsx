'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { CreditCard } from 'lucide-react';
import { listPurchaseInvoicesBySupplier } from '@/actions/purchasing/supplier-360';

type Inv = { id: string; invoiceNumber: string; invoiceDate: string | Date; totalAmount: { toNumber(): number } | number; paidAmount: { toNumber(): number } | number; status: string; purchaseOrder: { orderNumber: string } | null; purchasePayments: { id: string; amount: { toNumber(): number } | number; paymentDate: string | Date }[] };

function fmtDate(d: string | Date){ return new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',year:'numeric'}).format(new Date(d)); }
function toN(v:unknown){ if(v==null) return 0; if(typeof v==='number') return v; if(typeof v==='object' && 'toNumber' in (v as object)) return (v as {toNumber():number}).toNumber(); return Number(v); }
function fmtIdr(n:number){ return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n); }

export function SupplierPaymentsTab({ supplierId }: { supplierId: string }) {
  const [invoices, setInvoices] = useState<Inv[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); const res = await listPurchaseInvoicesBySupplier(supplierId); setInvoices(res.success ? ((res.data as unknown as { invoices: Inv[] })?.invoices ?? []) : []); setLoading(false); }, [supplierId]);
  useEffect(() => { load(); }, [load]);

  return (
    <Card>
      <CardHeader className="pb-3"><div className="flex items-center gap-3"><CreditCard className="h-5 w-5 text-primary" /><div><CardTitle className="text-base">Hutang & Pembayaran</CardTitle><p className="text-xs text-muted-foreground">{invoices.length} invoice</p></div></div></CardHeader>
      <CardContent className="space-y-4">
        {loading ? <p className="text-xs text-center py-8 text-muted-foreground">Memuat…</p> : invoices.length===0 ? <p className="text-xs text-center py-8 text-muted-foreground">Belum ada invoice hutang.</p> :
        <div className="overflow-x-auto"><Table><TableHeader className="bg-muted/30"><TableRow><TableHead>No. Invoice</TableHead><TableHead>PO</TableHead><TableHead>Tanggal</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Dibayar</TableHead><TableHead className="text-right">Sisa</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
        <TableBody>{invoices.map(inv => {
          const total = toN(inv.totalAmount); const paid = toN(inv.paidAmount);
          return <TableRow key={inv.id}><TableCell className="font-mono text-sm">{inv.invoiceNumber}</TableCell><TableCell className="text-sm">{inv.purchaseOrder?.orderNumber ?? '-'}</TableCell><TableCell className="text-sm">{fmtDate(inv.invoiceDate)}</TableCell><TableCell className="text-right font-mono text-sm">{fmtIdr(total)}</TableCell><TableCell className="text-right font-mono text-sm text-emerald-600">{fmtIdr(paid)}</TableCell><TableCell className="text-right font-mono text-sm text-rose-600">{fmtIdr(total-paid)}</TableCell><TableCell><Badge variant="outline" className="text-[10px]">{inv.status}</Badge></TableCell></TableRow>;
        })}</TableBody></Table></div>}
      </CardContent>
    </Card>
  );
}
