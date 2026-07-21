import { getEmployeeSession } from '@/lib/auth/employee-session';
import { redirect } from 'next/navigation';
import { getMyWeeklyPayroll, getMyPayslips, getMyLoansAndBpjs } from '@/actions/employee/self';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function fmtIdr(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
}
function fmtDate(d: string | Date | number) {
  return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

type WeeklyRes = Awaited<ReturnType<typeof getMyWeeklyPayroll>>;
type PayslipsRes = Awaited<ReturnType<typeof getMyPayslips>>;
type FinanceRes = Awaited<ReturnType<typeof getMyLoansAndBpjs>>;
type WeeklyData = NonNullable<WeeklyRes['data']>;
type PayslipRow = NonNullable<PayslipsRes['data']>[number];
type FinanceData = NonNullable<FinanceRes['data']>;

export default async function MyGajiPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const session = await getEmployeeSession().catch(() => null);
  if (!session) redirect('/my/login');

  const sp = await searchParams;
  const [weeklyRes, payslipsRes, financeRes] = await Promise.all([
    getMyWeeklyPayroll(sp.week).catch((): WeeklyRes => ({ success: false, error: 'Gagal' })),
    getMyPayslips().catch((): PayslipsRes => ({ success: false, error: 'Gagal' })),
    getMyLoansAndBpjs().catch((): FinanceRes => ({ success: false, error: 'Gagal' })),
  ]);

  const weekly: WeeklyData | null = weeklyRes.data ?? null;
  const payslips: PayslipRow[] = payslipsRes.data ?? [];
  const finance: FinanceData | null = financeRes.data ?? null;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-black tracking-tight">Gaji Saya</h1>

      {weekly ? (
        <Card className="border-primary/20">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Estimasi Minggu Ini ({weekly.weekStart ? fmtDate(weekly.weekStart) : ''} - {weekly.weekEnd ? fmtDate(weekly.weekEnd) : ''})</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="bg-muted/40 rounded-lg p-2"><div className="text-muted-foreground">Hari Kerja</div><div className="font-bold text-sm">{weekly.daysWorked ?? 0}</div></div>
              <div className="bg-muted/40 rounded-lg p-2"><div className="text-muted-foreground">Jam Kerja</div><div className="font-bold text-sm">{(weekly.totalActualHours ?? 0).toFixed(1)} j</div></div>
              <div className="bg-muted/40 rounded-lg p-2"><div className="text-muted-foreground">Kg Dibayar</div><div className="font-bold text-sm">{weekly.totalKgPaid ?? 0}</div></div>
              <div className="bg-muted/40 rounded-lg p-2"><div className="text-muted-foreground">Kg Exception</div><div className="font-bold text-sm">{weekly.totalKgUnpaid ?? 0}</div></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
              <div className="rounded-lg p-2 border"><div>Harian</div><div className="font-bold">{fmtIdr(weekly.totalDailyEarnings ?? 0)}</div></div>
              <div className="rounded-lg p-2 border"><div>Lembur</div><div className="font-bold">{fmtIdr(weekly.totalOvertimeEarnings ?? 0)}</div></div>
              <div className="rounded-lg p-2 border"><div>Borongan</div><div className="font-bold">{fmtIdr(weekly.totalPieceEarnings ?? 0)}</div></div>
              {weekly.totalKgUnpaid > 0 && <div className="rounded-lg p-2 border border-rose-200 bg-rose-50 text-rose-700"><div>Potensi Minus</div><div className="font-bold">{weekly.totalKgUnpaid} Kg tidak dibayar (exception)</div></div>}
            </div>
            {weekly.bpjsDeduction > 0 && <div className="text-[11px] text-rose-600">Potongan BPJS minggu ini: -{fmtIdr(weekly.bpjsDeduction)}</div>}
            <div className="rounded-xl bg-emerald-500 text-white p-3 flex justify-between items-center">
              <div className="text-xs opacity-90">Bersih Estimasi</div>
              <div className="font-black text-lg">{fmtIdr(weekly.netPay ?? weekly.totalEarnings ?? 0)}</div>
            </div>
            <div className="text-[10px] text-muted-foreground">Estimasi real-time berdasarkan absensi & produksi yang sudah diinput. Final sesuai payroll HRD.</div>
          </CardContent>
        </Card>
      ) : (
        <Card><CardContent className="py-8 text-xs text-muted-foreground text-center">Gagal memuat estimasi minggu ini.</CardContent></Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs">Kasbon Aktif</CardTitle></CardHeader>
          <CardContent className="text-[11px] space-y-1">
            {finance?.loans?.length ? finance.loans.map((l) => (
              <div key={l.id} className="flex justify-between border-b py-1.5 last:border-0"><span>{l.loanNumber} • {l.type} • {l.status}</span><span className="font-bold">{fmtIdr(l.remaining)} sisa</span></div>
            )) : <div className="text-muted-foreground">Tidak ada kasbon aktif.</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs">Potongan BPJS</CardTitle></CardHeader>
          <CardContent className="text-[11px] space-y-1">
            <div>Peserta: {finance?.bpjs?.participant ? 'Ya' : 'Tidak'}</div>
            <div>Potongan Karyawan: {fmtIdr(finance?.bpjs?.deduction ?? 0)}</div>
            {finance?.bpjs?.kesNo && <div>No Kes: {finance.bpjs.kesNo}</div>}
            {finance?.bpjs?.ketNo && <div>No Ket: {finance.bpjs.ketNo}</div>}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-bold">Slip Bulanan</h3>
        {payslips.length === 0 ? (
          <Card><CardContent className="py-6 text-xs text-muted-foreground text-center">Belum ada slip bulanan.</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {payslips.slice(0, 10).map((p) => (
              <Card key={p.id} className="py-0">
                <CardContent className="p-3 flex justify-between">
                  <div>
                    <div className="text-xs font-semibold">
                      {p.payrollPeriod ? `${p.payrollPeriod.month}/${p.payrollPeriod.year}` : p.id}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{p.status} • {fmtDate(p.createdAt)}</div>
                  </div>
                  <div className="text-right"><div className="text-xs font-bold">{fmtIdr(Number(p.netPay ?? 0))}</div><div className="text-[10px] text-muted-foreground">Bersih</div></div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
