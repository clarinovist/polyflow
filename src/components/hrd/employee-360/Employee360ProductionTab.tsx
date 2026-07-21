'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Factory, ChevronLeft, ChevronRight } from 'lucide-react';
import { listExecutionsByOperator } from '@/actions/hrd/executions-employee';

type Exec = {
  id: string;
  startTime: Date | string;
  quantityProduced: { toNumber(): number } | number;
  pieceRateSnapshot: { toNumber(): number } | number | null;
  pieceEarnings: { toNumber(): number } | number | null;
  pieceMachineType: string | null;
  status: string;
  orderNumber: string;
};

function toN(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && 'toNumber' in (v as object)) return (v as { toNumber(): number }).toNumber();
  return Number(v);
}

function fmtDate(d: Date | string): string {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(new Date(d));
}
function fmtIdr(n: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
}

function monthRange(base: Date) {
  const y = base.getUTCFullYear();
  const m = base.getUTCMonth();
  return {
    from: new Date(Date.UTC(y, m, 1)),
    to: new Date(Date.UTC(y, m + 1, 0)),
    label: new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(new Date(Date.UTC(y, m, 15))),
  };
}

interface Props {
  employeeId: string;
}

export function Employee360ProductionTab({ employeeId }: Props) {
  const [execs, setExecs] = useState<Exec[]>([]);
  const [loading, setLoading] = useState(true);
  const [baseDate, setBaseDate] = useState(new Date());

  const load = useCallback(async (base: Date) => {
    setLoading(true);
    const { from, to } = monthRange(base);
    const res = await listExecutionsByOperator(employeeId, from.toISOString(), to.toISOString());
    setExecs(res.success ? ((res.data ?? []) as unknown as Exec[]) : []);
    setLoading(false);
  }, [employeeId]);

  useEffect(() => { load(baseDate); }, [baseDate, load]);

  const prevMonth = () => { const d = new Date(baseDate); d.setUTCMonth(d.getUTCMonth() - 1); setBaseDate(d); };
  const nextMonth = () => { const d = new Date(baseDate); d.setUTCMonth(d.getUTCMonth() + 1); setBaseDate(d); };

  const { label } = monthRange(baseDate);
  const totalKg = execs.reduce((s, e) => s + toN(e.quantityProduced), 0);
  const totalEarnings = execs.reduce((s, e) => s + toN(e.pieceEarnings), 0);
  const paidExecs = execs.filter(e => e.pieceRateSnapshot != null && toN(e.pieceRateSnapshot) > 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Factory className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-base">Produksi Borongan</CardTitle>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-amber-500/5 p-3 rounded-lg border border-amber-500/10">
              <div className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400">Total Kg</div>
              <div className="text-xl font-bold">{totalKg}</div>
            </div>
            <div className="bg-emerald-500/5 p-3 rounded-lg border border-emerald-500/10">
              <div className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Total Upah</div>
              <div className="text-xl font-bold">{fmtIdr(totalEarnings)}</div>
            </div>
            <div className="bg-muted/30 p-3 rounded-lg">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Proses</div>
              <div className="text-xl font-bold">{paidExecs.length}</div>
            </div>
          </div>

          {loading ? (
            <p className="text-xs text-muted-foreground text-center py-8">Memuat…</p>
          ) : execs.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">Tidak ada data produksi bulan ini.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Proses</TableHead>
                    <TableHead className="text-right">Kg</TableHead>
                    <TableHead className="text-right">Rate/kg</TableHead>
                    <TableHead className="text-right">Upah</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {execs.map((ex) => {
                    const qty = toN(ex.quantityProduced);
                    const rate = toN(ex.pieceRateSnapshot);
                    const earnings = toN(ex.pieceEarnings);
                    const hasRate = ex.pieceRateSnapshot != null && rate > 0;
                    return (
                      <TableRow key={ex.id}>
                        <TableCell className="text-sm">{fmtDate(ex.startTime)}</TableCell>
                        <TableCell className="text-sm font-mono text-xs">{ex.orderNumber}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">{ex.pieceMachineType ?? '-'}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">{qty}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{hasRate ? fmtIdr(rate) : '-'}</TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold">
                          {hasRate ? fmtIdr(earnings) : (
                            <Badge variant="outline" className="text-[10px] bg-rose-500/10 text-rose-600 border-rose-500/10">
                              Rate Missing
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
