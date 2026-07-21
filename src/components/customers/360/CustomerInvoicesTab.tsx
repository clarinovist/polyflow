'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { FileText } from 'lucide-react';
import { listCustomerInvoices } from '@/actions/sales/customer-360';
import Link from 'next/link';

type Invoice = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string | Date;
  dueDate: string | Date | null;
  totalAmount: { toNumber(): number } | number;
  paidAmount: { toNumber(): number } | number;
  status: string;
  salesOrder: { orderNumber: string } | null;
};

function toN(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && 'toNumber' in (v as object)) return (v as { toNumber(): number }).toNumber();
  return Number(v);
}
function fmtDate(d: string | Date | null) {
  if (!d) return '-';
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d));
}
function fmtIdr(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
}
const STATUS_BADGE: Record<string, string> = {
  UNPAID: 'bg-rose-500/10 text-rose-700', PAID: 'bg-emerald-500/10 text-emerald-700',
  PARTIAL: 'bg-amber-500/10 text-amber-700', OVERDUE: 'bg-red-500/10 text-red-700',
};

export function CustomerInvoicesTab({ customerId }: { customerId: string }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listCustomerInvoices(customerId);
    setInvoices(res.success ? ((res.data ?? []) as unknown as Invoice[]) : []);
    setLoading(false);
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  const totalUnpaid = invoices.filter(i => i.status !== 'PAID').reduce((s, i) => s + (toN(i.totalAmount) - toN(i.paidAmount)), 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-primary" />
          <div>
            <CardTitle className="text-base">Piutang & Invoice</CardTitle>
            <p className="text-xs text-muted-foreground">{invoices.length} invoice · belum dibayar {fmtIdr(totalUnpaid)}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? <p className="text-xs text-muted-foreground text-center py-8">Memuat…</p> :
        invoices.length === 0 ? <p className="text-xs text-muted-foreground text-center py-8">Belum ada invoice.</p> :
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30"><TableRow>
              <TableHead>No. Invoice</TableHead><TableHead>SO</TableHead><TableHead>Tanggal</TableHead><TableHead>Jatuh Tempo</TableHead>
              <TableHead className="text-right">Total</TableHead><TableHead className="text-right">Dibayar</TableHead><TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {invoices.map(inv => (
                <TableRow key={inv.id}>
                  <TableCell className="font-mono text-sm"><Link href={`/sales/invoices/${inv.id}`} className="hover:underline text-primary">{inv.invoiceNumber}</Link></TableCell>
                  <TableCell className="text-sm">{inv.salesOrder?.orderNumber ?? '-'}</TableCell>
                  <TableCell className="text-sm">{fmtDate(inv.invoiceDate)}</TableCell>
                  <TableCell className="text-sm">{fmtDate(inv.dueDate)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmtIdr(toN(inv.totalAmount))}</TableCell>
                  <TableCell className="text-right font-mono text-sm text-emerald-600">{fmtIdr(toN(inv.paidAmount))}</TableCell>
                  <TableCell><Badge variant="outline" className={`text-[10px] ${STATUS_BADGE[inv.status] || ''}`}>{inv.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>}
      </CardContent>
    </Card>
  );
}
