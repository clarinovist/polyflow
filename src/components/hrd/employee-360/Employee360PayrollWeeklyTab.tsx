'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Wallet, ChevronLeft, ChevronRight } from 'lucide-react';
import { getEmployeeWeeklyPayroll } from '@/actions/hrd/payroll';

type PayrollRecord = {
  date: Date;
  shiftName: string;
  status: string;
  actualHours: number | null;
  overtimeHours: number;
  dailyEarnings: number;
  overtimeEarnings: number;
  totalEarnings: number;
};

type PieceLine = {
  executionId: string;
  date: Date;
  machineType: string | null;
  quantityKg: number;
  ratePerKg: number | null;
  pieceEarnings: number | null;
  paid: boolean;
  reason?: string;
};

type WeeklyPayroll = {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  payType: string;
  weekStart: Date;
  weekEnd: Date;
  daysWorked: number;
  daysAbsent: number;
  totalActualHours: number;
  totalOvertimeHours: number;
  totalDailyEarnings: number;
  totalOvertimeEarnings: number;
  totalPieceEarnings: number;
  totalKgPaid: number;
  totalKgUnpaid: number;
  totalEarnings: number;
  bpjsDeduction: number;
  isBpjsWeek: boolean;
  netPay: number;
  records: PayrollRecord[];
  pieceLines: PieceLine[];
  exceptions: PieceLine[];
};

function formatIdr(n: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
}
function formatDate(d: Date): string {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d));
}
function formatHours(n: number): string { return n.toFixed(2); }

interface Props {
  employeeId: string;
  initialWeek?: string;
}

export function Employee360PayrollWeeklyTab({ employeeId, initialWeek }: Props) {
  const [payroll, setPayroll] = useState<WeeklyPayroll | null>(null);
  const [loading, setLoading] = useState(true);
  const [baseDate, setBaseDate] = useState(() => initialWeek ? new Date(initialWeek) : new Date());

  const load = useCallback(async (base: Date) => {
    setLoading(true);
    const res = await getEmployeeWeeklyPayroll(employeeId, base);
    setPayroll(res.success ? (res.data as unknown as WeeklyPayroll) : null);
    setLoading(false);
  }, [employeeId]);

  useEffect(() => { load(baseDate); }, [baseDate, load]);

  const prevWeek = () => { const d = new Date(baseDate); d.setDate(d.getDate() - 7); setBaseDate(d); };
  const nextWeek = () => { const d = new Date(baseDate); d.setDate(d.getDate() + 7); setBaseDate(d); };

  if (loading) return <p className="text-xs text-muted-foreground text-center py-8">Memuat…</p>;
  if (!payroll) return <p className="text-xs text-muted-foreground text-center py-8">Gagal memuat data gaji mingguan.</p>;

  const isPiece = payroll.payType === 'PIECE';

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Wallet className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-base">Gaji Mingguan</CardTitle>
                <CardDescription>{formatDate(payroll.weekStart)} — {formatDate(payroll.weekEnd)}</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={prevWeek}><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" onClick={nextWeek}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-muted/30 p-3 rounded-lg">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Hari Masuk</div>
              <div className="text-xl font-bold">{payroll.daysWorked}</div>
            </div>
            <div className="bg-muted/30 p-3 rounded-lg">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Hari Absen</div>
              <div className="text-xl font-bold">{payroll.daysAbsent}</div>
            </div>
            <div className="bg-muted/30 p-3 rounded-lg">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Jam Kerja</div>
              <div className="text-xl font-bold">{formatHours(payroll.totalActualHours)}</div>
            </div>
            {isPiece ? (
              <div className="bg-amber-500/5 p-3 rounded-lg border border-amber-500/10">
                <div className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400">Kg Dibayar</div>
                <div className="text-xl font-bold">{payroll.totalKgPaid}</div>
              </div>
            ) : (
              <div className="bg-muted/30 p-3 rounded-lg">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Jam Lembur</div>
                <div className="text-xl font-bold">{formatHours(payroll.totalOvertimeHours)}</div>
              </div>
            )}
          </div>

          {/* Earnings summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            {isPiece ? (
              <>
                <div className="bg-amber-500/5 p-3 rounded-lg border border-amber-500/10">
                  <div className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400">Borongan</div>
                  <div className="text-lg font-bold">{formatIdr(payroll.totalPieceEarnings)}</div>
                </div>
                {payroll.totalKgUnpaid > 0 && (
                  <div className="bg-rose-500/5 p-3 rounded-lg border border-rose-500/10">
                    <div className="text-[10px] uppercase tracking-wider text-rose-700 dark:text-rose-400">Kg Exception</div>
                    <div className="text-lg font-bold text-rose-700 dark:text-rose-400">{payroll.totalKgUnpaid}</div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="bg-primary/5 p-3 rounded-lg border border-primary/10">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Upah Harian</div>
                  <div className="text-lg font-bold">{formatIdr(payroll.totalDailyEarnings)}</div>
                </div>
                <div className="bg-primary/5 p-3 rounded-lg border border-primary/10">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Lembur</div>
                  <div className="text-lg font-bold">{formatIdr(payroll.totalOvertimeEarnings)}</div>
                </div>
              </>
            )}
            {payroll.bpjsDeduction > 0 && (
              <div className="bg-rose-500/5 p-3 rounded-lg border border-rose-500/10">
                <div className="text-[10px] uppercase tracking-wider text-rose-700 dark:text-rose-400">BPJS</div>
                <div className="text-lg font-bold text-rose-700 dark:text-rose-400">-{formatIdr(payroll.bpjsDeduction)}</div>
              </div>
            )}
            <div className="bg-emerald-500/10 p-3 rounded-lg border border-emerald-500/10">
              <div className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Net Pay</div>
              <div className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{formatIdr(payroll.netPay)}</div>
            </div>
          </div>

          {/* Detail table */}
          {isPiece && payroll.pieceLines.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Proses</TableHead>
                    <TableHead className="text-right">Kg</TableHead>
                    <TableHead className="text-right">Rate/kg</TableHead>
                    <TableHead className="text-right">Upah</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payroll.pieceLines.map((line) => (
                    <TableRow key={line.executionId}>
                      <TableCell className="text-sm">{formatDate(line.date)}</TableCell>
                      <TableCell className="text-sm">{line.machineType ?? '-'}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{line.quantityKg}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{line.ratePerKg != null ? formatIdr(line.ratePerKg) : '-'}</TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold">
                        {line.pieceEarnings != null ? formatIdr(line.pieceEarnings) : '-'}
                      </TableCell>
                      <TableCell>
                        {line.paid ? (
                          <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/10">Dibayar</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] bg-rose-500/10 text-rose-600 border-rose-500/10">
                            {line.reason === 'NO_ATTENDANCE' ? 'Tanpa Absen' : 'Rate Missing'}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : !isPiece ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Shift</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Jam Kerja</TableHead>
                    <TableHead className="text-right">Lembur</TableHead>
                    <TableHead className="text-right">Upah</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payroll.records.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">Tidak ada data absensi minggu ini.</TableCell>
                    </TableRow>
                  ) : payroll.records.map((r) => (
                    <TableRow key={`${r.date}-${r.shiftName}`}>
                      <TableCell className="text-sm">{formatDate(r.date)}</TableCell>
                      <TableCell className="text-sm">{r.shiftName}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${
                          r.status === 'PRESENT' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/10' :
                          r.status === 'ABSENT' ? 'bg-rose-500/10 text-rose-600 border-rose-500/10' :
                          'bg-amber-500/10 text-amber-600 border-amber-500/10'
                        }`}>{r.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{r.actualHours != null ? formatHours(r.actualHours) : '-'}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatHours(r.overtimeHours)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatIdr(r.dailyEarnings)}</TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold">{formatIdr(r.totalEarnings)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-8">Tidak ada data produksi minggu ini.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
