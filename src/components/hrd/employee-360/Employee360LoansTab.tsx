'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { HandCoins } from 'lucide-react';
import { listLoans } from '@/actions/hrd/payroll-monthly';

type Loan = {
  id: string;
  loanNumber: string;
  date: string | Date;
  principalAmount: { toNumber(): number } | number;
  remainingBalance: { toNumber(): number } | number;
  installmentAmount: { toNumber(): number } | number | null;
  repaymentType: string;
  status: string;
  reason: string | null;
};

function toN(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && 'toNumber' in (v as object)) return (v as { toNumber(): number }).toNumber();
  return Number(v);
}

function fmtDate(d: string | Date): string {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d));
}
function fmtIdr(n: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
}

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'bg-emerald-500/10 text-emerald-700',
  PAID_OFF: 'bg-blue-500/10 text-blue-700',
  DEFAULTED: 'bg-rose-500/10 text-rose-700',
};

interface Props {
  employeeId: string;
}

export function Employee360LoansTab({ employeeId }: Props) {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listLoans({ employeeId });
    setLoans(res.success ? ((res.data ?? []) as unknown as Loan[]) : []);
    setLoading(false);
  }, [employeeId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <HandCoins className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Kasbon</CardTitle>
              <p className="text-xs text-muted-foreground">{loans.length} kasbon tercatat</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-xs text-muted-foreground text-center py-8">Memuat…</p>
          ) : loans.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">Belum ada kasbon.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>No. Kasbon</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Pokok</TableHead>
                    <TableHead>Sisa</TableHead>
                    <TableHead>Cicilan</TableHead>
                    <TableHead>Tipe</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loans.map((k) => (
                    <TableRow key={k.id}>
                      <TableCell className="text-sm font-mono">{k.loanNumber}</TableCell>
                      <TableCell className="text-sm">{fmtDate(k.date)}</TableCell>
                      <TableCell className="text-right text-sm font-mono">{fmtIdr(toN(k.principalAmount))}</TableCell>
                      <TableCell className="text-right text-sm font-mono">{fmtIdr(toN(k.remainingBalance))}</TableCell>
                      <TableCell className="text-right text-sm font-mono">{k.installmentAmount ? fmtIdr(toN(k.installmentAmount)) : '-'}</TableCell>
                      <TableCell className="text-sm">{k.repaymentType === 'INSTALLMENT' ? 'Cicilan' : 'Lunas Bulan Depan'}</TableCell>
                      <TableCell>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[k.status] || ''}`}>{k.status}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
