import { getAllWeeklyPayroll } from '@/actions/hrd/payroll';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import Link from 'next/link';
import { UrlWeekPicker } from '@/components/common/url-week-picker';
import { startOfWeek, endOfWeek } from '@/services/hrd/week-range';

function formatIdr(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
}

function weekLabel(start: Date, end: Date) {
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' };
  return `${start.toLocaleDateString('id-ID', opts)} – ${end.toLocaleDateString('id-ID', opts)}`;
}

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const res = await getAllWeeklyPayroll(params.date);
  const rows = res.success && res.data ? res.data : [];
  // Fase 3: derive current picker date explicitly (was implicit from rows[0]).
  const baseDate = params.date ? new Date(params.date) : new Date();
  const weekStart = rows[0]?.weekStart ?? startOfWeek(baseDate).toISOString();
  const weekEnd = rows[0]?.weekEnd ?? endOfWeek(baseDate).toISOString();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gaji Mingguan</h1>
          <p className="text-muted-foreground mt-1">
            Harian dari absensi · Borongan dari output operator (gate absensi) · BPJS dipotong di minggu terakhir bulan
            {weekStart && weekEnd ? ` · ${weekLabel(new Date(weekStart), new Date(weekEnd))}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <UrlWeekPicker currentDate={baseDate} />
          {rows.length > 0 && (
            <form action="/api/hrd/payroll/export" method="GET">
              <input type="hidden" name="date" value={params.date || ''} />
              <Button type="submit" size="sm" variant="outline" className="gap-1">
                <Download className="h-4 w-4" /> CSV
              </Button>
            </form>
          )}
        </div>
      </div>

      <Card className="bg-background/40 backdrop-blur-xl border-white/10 shadow-xl border-0 overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base">Rekap karyawan aktif</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="p-3">Kode</th>
                  <th className="p-3">Nama</th>
                  <th className="p-3">Basis</th>
                  <th className="p-3 text-right">Hadir</th>
                  <th className="p-3 text-right">Jam</th>
                  <th className="p-3 text-right">Kg dibayar</th>
                  <th className="p-3 text-right">Kg exception</th>
                  <th className="p-3 text-right">Daily</th>
                  <th className="p-3 text-right">OT</th>
                  <th className="p-3 text-right">Piece</th>
                  <th className="p-3 text-right">Bruto</th>
                  <th className="p-3 text-right">BPJS</th>
                  <th className="p-3 text-right">Netto</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={13} className="p-6 text-center text-muted-foreground">
                      Tidak ada data
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r.employeeId} className="border-t">
                    <td className="p-3 font-mono text-xs">{r.employeeCode}</td>
                    <td className="p-3">{r.employeeName}</td>
                    <td className="p-3">
                      <span className={r.payType === 'PIECE' ? 'text-amber-600 font-medium' : 'text-muted-foreground'}>
                        {r.payType === 'PIECE' ? 'Borongan' : r.payType === 'MONTHLY' ? 'Bulanan' : 'Harian'}
                      </span>
                    </td>
                    <td className="p-3 text-right">{r.daysWorked}</td>
                    <td className="p-3 text-right">{r.totalActualHours}</td>
                    <td className="p-3 text-right">{r.totalKgPaid}</td>
                    <td className="p-3 text-right">
                      {r.totalKgUnpaid > 0 ? (
                        <span className="text-red-600">{r.totalKgUnpaid}</span>
                      ) : (
                        0
                      )}
                    </td>
                    <td className="p-3 text-right">{formatIdr(r.totalDailyEarnings)}</td>
                    <td className="p-3 text-right">{formatIdr(r.totalOvertimeEarnings)}</td>
                    <td className="p-3 text-right">{formatIdr(r.totalPieceEarnings)}</td>
                    <td className="p-3 text-right">{formatIdr(r.totalEarnings)}</td>
                    <td className="p-3 text-right">
                      {r.bpjsDeduction > 0 ? (
                        <span className="text-red-600">-{formatIdr(r.bpjsDeduction)}</span>
                      ) : r.isBpjsWeek ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className="text-muted-foreground text-xs">bukan mgg akhir</span>
                      )}
                    </td>
                    <td className="p-3 text-right font-semibold">{formatIdr(r.netPay)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="p-3 text-xs text-muted-foreground border-t">
            Exception kg = output tanpa absensi PRESENT di hari yang sama, atau rate proses belum di-set.
            BPJS potongan bulanan penuh hanya di minggu yang memuat akhir bulan (harian/borongan).{' '}
            <Link href="/hrd/piece-rates" className="underline">
              Atur tarif borongan
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
