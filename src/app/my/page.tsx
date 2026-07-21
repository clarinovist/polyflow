import { getEmployeeSession, getCurrentEmployeeFull } from '@/lib/auth/employee-session';
import { redirect } from 'next/navigation';
import { getMyWeeklyPayroll, getMyProductions, getMyAttendanceMonth, getMyLoansAndBpjs } from '@/actions/employee/self';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { Wallet, Factory, Calendar, AlertTriangle } from 'lucide-react';

function fmtIdr(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
}

type WeeklyRes = Awaited<ReturnType<typeof getMyWeeklyPayroll>>;
type ProdRes = Awaited<ReturnType<typeof getMyProductions>>;
type AttRes = Awaited<ReturnType<typeof getMyAttendanceMonth>>;
type LoanRes = Awaited<ReturnType<typeof getMyLoansAndBpjs>>;
type WeeklyData = NonNullable<WeeklyRes['data']>;
type ProdRow = NonNullable<ProdRes['data']>[number];
type AttRow = NonNullable<AttRes['data']>[number];
type FinanceData = NonNullable<LoanRes['data']>;

export default async function MyHomePage() {
  const session = await getEmployeeSession().catch(() => null);
  if (!session) redirect('/my/login');

  const empFull = await getCurrentEmployeeFull().catch(() => null);
  const [weeklyRes, prodRes, attRes, loanRes] = await Promise.all([
    getMyWeeklyPayroll().catch((): WeeklyRes => ({ success: false, error: 'Gagal' })),
    getMyProductions().catch((): ProdRes => ({ success: false, error: 'Gagal' })),
    getMyAttendanceMonth(new Date().getFullYear(), new Date().getMonth() + 1).catch(
      (): AttRes => ({ success: false, error: 'Gagal' }),
    ),
    getMyLoansAndBpjs().catch((): LoanRes => ({ success: false, error: 'Gagal' })),
  ]);

  const weekly: WeeklyData | null = weeklyRes.data ?? null;
  const prods: ProdRow[] = prodRes.data ?? [];
  const atts: AttRow[] = attRes.data ?? [];
  const finance: FinanceData | null = loanRes.data ?? null;

  const todayStr = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });

  const totalKgWeek = weekly?.totalKgPaid ?? 0;
  const hadirBulanIni = atts.filter((r) => r.status === 'PRESENT').length;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground p-5 shadow-sm">
        <div className="text-xs opacity-80">{todayStr}</div>
        <div className="text-xl font-black mt-1">Halo, {session.name} 👋</div>
        <div className="text-xs opacity-90 mt-1">Performa & gaji kamu update real-time dari kiosk.</div>
        {weekly && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="bg-white/15 backdrop-blur rounded-xl p-3">
              <div className="text-[10px] opacity-80 uppercase tracking-wider">Estimasi Minggu Ini</div>
              <div className="text-lg font-black mt-1">{fmtIdr(weekly.netPay ?? weekly.totalEarnings ?? 0)}</div>
              <div className="text-[10px] mt-1 opacity-80">{weekly.daysWorked ?? 0} hari • {totalKgWeek} Kg</div>
            </div>
            <div className="bg-white/15 backdrop-blur rounded-xl p-3">
              <div className="text-[10px] opacity-80 uppercase tracking-wider">Kehadiran Bulan</div>
              <div className="text-lg font-black mt-1">{hadirBulanIni} hari</div>
              <div className="text-[10px] mt-1 opacity-80">{empFull?.payType ?? ''} • {empFull?.role ?? ''}</div>
            </div>
          </div>
        )}
      </div>

      {!empFull?.phone && (
        <div className="flex gap-2 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          No HP belum diisi. Hubungi HRD supaya bisa login pakai No HP.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Link href="/my/gaji">
          <Card className="hover:shadow-md transition-shadow h-full">
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Wallet className="h-4 w-4" /> Gaji Saya</CardTitle></CardHeader>
            <CardContent>
              <div className="text-[11px] text-muted-foreground">Estimasi, potongan BPJS, kasbon, slip.</div>
              {weekly && <div className="mt-2 text-sm font-bold">{fmtIdr(weekly.netPay ?? weekly.totalEarnings ?? 0)}</div>}
            </CardContent>
          </Card>
        </Link>
        <Link href="/my/produksi">
          <Card className="hover:shadow-md transition-shadow h-full">
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Factory className="h-4 w-4" /> Hasil Saya</CardTitle></CardHeader>
            <CardContent>
              <div className="text-[11px] text-muted-foreground">Output borongan & harian.</div>
              <div className="mt-2 text-sm font-bold">{prods.length} laporan (30 hari)</div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/my/absensi">
          <Card className="hover:shadow-md transition-shadow h-full">
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Calendar className="h-4 w-4" /> Absensi</CardTitle></CardHeader>
            <CardContent>
              <div className="text-[11px] text-muted-foreground">Hadir, izin, alfa bulan ini.</div>
              <div className="mt-2 text-sm font-bold">{hadirBulanIni} hari hadir</div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-bold tracking-tight">Produksi Terbaru (My Input → Gaji)</h3>
        {prods.length === 0 ? (
          <Card><CardContent className="py-6 text-xs text-muted-foreground text-center">Belum ada input 30 hari terakhir. Yuk input di kiosk — gaji naik tiap input.</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {prods.slice(0, 5).map((p) => (
              <Card key={p.id} className="py-0">
                <CardContent className="p-3 flex justify-between items-center">
                  <div>
                    <div className="text-xs font-semibold">{p.productName}</div>
                    <div className="text-[11px] text-muted-foreground">{p.orderNumber} • {p.machineName} • {new Date(p.startTime).toLocaleDateString('id-ID')}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold">{p.quantity} Kg</div>
                    {p.pieceEarnings != null && <div className="text-[10px] text-emerald-600">{fmtIdr(p.pieceEarnings)}</div>}
                  </div>
                </CardContent>
              </Card>
            ))}
            <Link href="/my/produksi" className="text-xs text-primary font-semibold">Lihat semua →</Link>
          </div>
        )}
      </div>

      {finance && (
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs">Sisa Kasbon</CardTitle></CardHeader>
            <CardContent>
              {finance.loans?.length ? (
                <div className="space-y-1">
                  {finance.loans.slice(0, 2).map((l) => (
                    <div key={l.id} className="flex justify-between text-[11px]"><span>{l.loanNumber}</span><span className="font-bold">{fmtIdr(l.remaining)}</span></div>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-muted-foreground">Tidak ada kasbon aktif.</div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs">BPJS & Rekening</CardTitle></CardHeader>
            <CardContent className="text-[11px] space-y-1">
              <div>Peserta: {finance.bpjs?.participant ? 'Ya' : 'Tidak'}</div>
              {finance.bpjs?.deduction ? <div>Potongan: {fmtIdr(finance.bpjs.deduction)}</div> : null}
              {finance.salary?.bankName && <div>{finance.salary.bankName} • {finance.salary.bankNo}</div>}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
