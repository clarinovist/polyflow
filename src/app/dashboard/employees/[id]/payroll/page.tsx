import { getEmployeeById } from '@/actions/admin/employees';
import { getEmployeeWeeklyPayroll } from '@/actions/hrd/payroll';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

interface EmployeePayrollPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ week?: string }>;
}

function formatIdr(n: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

function formatHours(n: number): string {
  return n.toFixed(2);
}

export default async function EmployeePayrollPage({ params, searchParams }: EmployeePayrollPageProps) {
  const { id } = await params;
  const { week } = await searchParams;

  const employeeResult = await getEmployeeById(id);
  if (!employeeResult.success || !employeeResult.data) {
    notFound();
  }
  const employee = employeeResult.data;

  const baseDate = week ? new Date(week) : new Date();
  const payrollResult = await getEmployeeWeeklyPayroll(id, baseDate);
  if (!payrollResult.success || !payrollResult.data) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gaji Mingguan</h1>
          <p className="text-muted-foreground mt-1">{employee.name} — {employee.code}</p>
        </div>
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Gagal memuat data gaji.
          </CardContent>
        </Card>
      </div>
    );
  }
  const payroll = payrollResult.data;
  const isPiece = payroll.payType === 'PIECE';

  const prevWeek = new Date(baseDate);
  prevWeek.setDate(prevWeek.getDate() - 7);
  const nextWeek = new Date(baseDate);
  nextWeek.setDate(nextWeek.getDate() + 7);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gaji Mingguan</h1>
          <p className="text-muted-foreground mt-1">
            {employee.name} <span className="font-mono text-xs">({employee.code})</span>
            <Badge variant="outline" className={`ml-2 ${isPiece ? 'text-amber-600 border-amber-500/30' : ''}`}>
              {isPiece ? 'Borongan' : 'Harian'}
            </Badge>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/dashboard/employees/${id}/edit`}>
            <Button variant="outline" size="sm">Edit Karyawan</Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CalendarDays className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-base">Periode Mingguan</CardTitle>
                <CardDescription>{formatDate(payroll.weekStart)} — {formatDate(payroll.weekEnd)}</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Link href={`/dashboard/employees/${id}/payroll?week=${prevWeek.toISOString().slice(0, 10)}`}>
                <Button variant="ghost" size="icon"><ChevronLeft className="h-4 w-4" /></Button>
              </Link>
              <Link href={`/dashboard/employees/${id}/payroll?week=${nextWeek.toISOString().slice(0, 10)}`}>
                <Button variant="ghost" size="icon"><ChevronRight className="h-4 w-4" /></Button>
              </Link>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-muted/30 p-4 rounded-lg">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Hari Masuk</div>
              <div className="text-2xl font-bold">{payroll.daysWorked}</div>
            </div>
            <div className="bg-muted/30 p-4 rounded-lg">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Hari Absen</div>
              <div className="text-2xl font-bold">{payroll.daysAbsent}</div>
            </div>
            <div className="bg-muted/30 p-4 rounded-lg">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Jam Kerja</div>
              <div className="text-2xl font-bold">{formatHours(payroll.totalActualHours)}</div>
            </div>
            {isPiece ? (
              <div className="bg-amber-500/5 p-4 rounded-lg border border-amber-500/10">
                <div className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400">Kg Dibayar</div>
                <div className="text-2xl font-bold">{payroll.totalKgPaid}</div>
              </div>
            ) : (
              <div className="bg-muted/30 p-4 rounded-lg">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Jam Lembur</div>
                <div className="text-2xl font-bold">{formatHours(payroll.totalOvertimeHours)}</div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {isPiece ? (
              <>
                <div className="bg-amber-500/5 p-4 rounded-lg border border-amber-500/10">
                  <div className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400">Borongan</div>
                  <div className="text-xl font-bold">{formatIdr(payroll.totalPieceEarnings)}</div>
                  <div className="text-xs text-muted-foreground mt-1">{payroll.totalKgPaid} kg dibayar</div>
                </div>
                {payroll.totalKgUnpaid > 0 && (
                  <div className="bg-rose-500/5 p-4 rounded-lg border border-rose-500/10">
                    <div className="text-[10px] uppercase tracking-wider text-rose-700 dark:text-rose-400">Kg Exception</div>
                    <div className="text-xl font-bold text-rose-700 dark:text-rose-400">{payroll.totalKgUnpaid}</div>
                    <div className="text-xs text-muted-foreground mt-1">tanpa absen / rate missing</div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="bg-primary/5 p-4 rounded-lg border border-primary/10">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Upah Harian</div>
                  <div className="text-xl font-bold">{formatIdr(payroll.totalDailyEarnings)}</div>
                </div>
                <div className="bg-primary/5 p-4 rounded-lg border border-primary/10">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Lembur</div>
                  <div className="text-xl font-bold">{formatIdr(payroll.totalOvertimeEarnings)}</div>
                </div>
              </>
            )}
            <div className="bg-emerald-500/10 p-4 rounded-lg border border-emerald-500/10">
              <div className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Total Gaji</div>
              <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{formatIdr(payroll.totalEarnings)}</div>
            </div>
          </div>

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
                      <TableCell>{formatDate(line.date)}</TableCell>
                      <TableCell>{line.machineType ?? '-'}</TableCell>
                      <TableCell className="text-right font-mono">{line.quantityKg}</TableCell>
                      <TableCell className="text-right font-mono">{line.ratePerKg != null ? formatIdr(line.ratePerKg) : '-'}</TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        {line.pieceEarnings != null ? formatIdr(line.pieceEarnings) : '-'}
                      </TableCell>
                      <TableCell>
                        {line.paid ? (
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/10">Dibayar</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-rose-500/10 text-rose-600 border-rose-500/10">
                            {line.reason === 'NO_ATTENDANCE' ? 'Tanpa Absen' : 'Rate Missing'}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
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
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        Tidak ada data absensi di minggu ini.
                      </TableCell>
                    </TableRow>
                  ) : (
                    payroll.records.map((record) => (
                      <TableRow key={`${record.date.toISOString()}-${record.shiftName}`}>
                        <TableCell>{formatDate(record.date)}</TableCell>
                        <TableCell>{record.shiftName}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={
                            record.status === 'PRESENT'
                              ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/10'
                              : record.status === 'ABSENT'
                                ? 'bg-rose-500/10 text-rose-600 border-rose-500/10'
                                : 'bg-amber-500/10 text-amber-600 border-amber-500/10'
                          }>
                            {record.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">{record.actualHours != null ? formatHours(record.actualHours) : '-'}</TableCell>
                        <TableCell className="text-right font-mono">{formatHours(record.overtimeHours)}</TableCell>
                        <TableCell className="text-right font-mono">{formatIdr(record.dailyEarnings)}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">{formatIdr(record.totalEarnings)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
