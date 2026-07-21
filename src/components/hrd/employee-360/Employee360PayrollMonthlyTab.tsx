'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { CalendarRange, ExternalLink } from 'lucide-react';
import { listPayslipsByEmployee, listActiveAllowances } from '@/actions/hrd/payslips-employee';

type Payslip = {
  id: string;
  employeeId: string;
  baseSalary: { toNumber(): number } | number;
  allowanceTotal: { toNumber(): number } | number;
  thrAmount: { toNumber(): number } | number;
  prorationDeduction: { toNumber(): number } | number;
  grossPay: { toNumber(): number } | number;
  bpjsDeduction: { toNumber(): number } | number;
  loanDeduction: { toNumber(): number } | number;
  otherDeductions: { toNumber(): number } | number;
  deductionTotal: { toNumber(): number } | number;
  netPay: { toNumber(): number } | number;
  status: string;
  payrollPeriod: { id: string; year: number; month: number; status: string } | null;
  allowances: Array<{ id: string; name: string; amount: { toNumber(): number } | number }>;
};

type Allowance = {
  id: string;
  name: string;
  amount: { toNumber(): number } | number;
  isActive: boolean;
};

function toN(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && 'toNumber' in (v as object)) return (v as { toNumber(): number }).toNumber();
  return Number(v);
}

function fmtIdr(n: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
}

const MONTHS = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'bg-amber-500/10 text-amber-700',
  FINALIZED: 'bg-blue-500/10 text-blue-700',
  PAID: 'bg-green-500/10 text-green-700',
};

interface Props {
  employeeId: string;
}

export function Employee360PayrollMonthlyTab({ employeeId }: Props) {
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [allowances, setAllowances] = useState<Allowance[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [pRes, aRes] = await Promise.all([
      listPayslipsByEmployee(employeeId),
      listActiveAllowances(employeeId),
    ]);
    setPayslips(pRes.success ? ((pRes.data ?? []) as unknown as Payslip[]) : []);
    setAllowances(aRes.success ? ((aRes.data ?? []) as unknown as Allowance[]) : []);
    setLoading(false);
  }, [employeeId]);

  useEffect(() => { load(); }, [load]);

  const totalNet = payslips.reduce((s, p) => s + toN(p.netPay), 0);

  return (
    <div className="space-y-4">
      {/* Active allowances */}
      {allowances.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Tunjangan Aktif</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {allowances.map((a) => (
                <Badge key={a.id} variant="secondary" className="text-xs">
                  {a.name}: {fmtIdr(toN(a.amount))}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <CalendarRange className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Riwayat Gaji Bulanan</CardTitle>
              <p className="text-xs text-muted-foreground">{payslips.length} periode</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-xs text-muted-foreground text-center py-8">Memuat…</p>
          ) : payslips.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">Belum ada riwayat gaji bulanan.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>Periode</TableHead>
                    <TableHead className="text-right">Gaji Pokok</TableHead>
                    <TableHead className="text-right">Tunjangan</TableHead>
                    <TableHead className="text-right">THR</TableHead>
                    <TableHead className="text-right">BPJS</TableHead>
                    <TableHead className="text-right">Kasbon</TableHead>
                    <TableHead className="text-right">Prorata</TableHead>
                    <TableHead className="text-right">Net Pay</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payslips.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm font-medium">
                        {p.payrollPeriod ? `${MONTHS[p.payrollPeriod.month]} ${p.payrollPeriod.year}` : '-'}
                      </TableCell>
                      <TableCell className="text-right text-sm font-mono">{fmtIdr(toN(p.baseSalary))}</TableCell>
                      <TableCell className="text-right text-sm font-mono">{fmtIdr(toN(p.allowanceTotal))}</TableCell>
                      <TableCell className="text-right text-sm font-mono">{fmtIdr(toN(p.thrAmount))}</TableCell>
                      <TableCell className="text-right text-sm font-mono text-red-600">-{fmtIdr(toN(p.bpjsDeduction))}</TableCell>
                      <TableCell className="text-right text-sm font-mono text-red-600">-{fmtIdr(toN(p.loanDeduction))}</TableCell>
                      <TableCell className="text-right text-sm font-mono text-red-600">-{fmtIdr(toN(p.prorationDeduction))}</TableCell>
                      <TableCell className="text-right text-sm font-mono font-semibold">{fmtIdr(toN(p.netPay))}</TableCell>
                      <TableCell>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[p.status] || ''}`}>{p.status}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        {p.payrollPeriod && (
                          <a
                            href={`/hrd/payroll-monthly/${p.payrollPeriod.id}/print?payslipId=${p.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                          >
                            Print <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <tfoot>
                  <tr className="border-t bg-muted/20 font-semibold">
                    <td className="p-2" colSpan={7}>Total Net Pay</td>
                    <td className="p-2 text-right font-mono">{fmtIdr(totalNet)}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
