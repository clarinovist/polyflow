import { getEmployeeSession } from '@/lib/auth/employee-session';
import { redirect } from 'next/navigation';
import { getMyProductions, getMyWeeklyPayroll } from '@/actions/employee/self';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function fmtIdr(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
}

type ProdRes = Awaited<ReturnType<typeof getMyProductions>>;
type WeeklyRes = Awaited<ReturnType<typeof getMyWeeklyPayroll>>;
type ProdRow = NonNullable<ProdRes['data']>[number];
type WeeklyData = NonNullable<WeeklyRes['data']>;

export default async function MyProduksiPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const session = await getEmployeeSession().catch(() => null);
  if (!session) redirect('/my/login');

  const sp = await searchParams;
  const [prodRes, weeklyRes] = await Promise.all([
    getMyProductions(sp.from, sp.to).catch((): ProdRes => ({ success: false, error: 'Gagal' })),
    getMyWeeklyPayroll().catch((): WeeklyRes => ({ success: false, error: 'Gagal' })),
  ]);

  const prods: ProdRow[] = prodRes.data ?? [];
  const weekly: WeeklyData | null = weeklyRes.data ?? null;

  const totalKg = prods.reduce((s, p) => s + (p.quantity ?? 0), 0);
  const totalRp = prods.reduce((s, p) => s + (p.pieceEarnings ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-end">
        <h1 className="text-lg font-black tracking-tight">Hasil Produksi Saya</h1>
        <div className="text-[11px] text-muted-foreground">30 hari terakhir</div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Card className="py-0"><CardContent className="p-3"><div className="text-[10px] text-muted-foreground">Total Laporan</div><div className="font-black">{prods.length}</div></CardContent></Card>
        <Card className="py-0"><CardContent className="p-3"><div className="text-[10px] text-muted-foreground">Total Kg</div><div className="font-black">{totalKg.toFixed(1)}</div></CardContent></Card>
        <Card className="py-0"><CardContent className="p-3"><div className="text-[10px] text-muted-foreground">Borongan</div><div className="font-black text-emerald-600">{fmtIdr(totalRp)}</div></CardContent></Card>
      </div>

      {weekly && (
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-3 text-[11px] flex justify-between">
            <span>Progress minggu ini: {weekly.daysWorked ?? 0} hari • {weekly.totalKgPaid ?? 0} Kg</span>
            <span className="font-bold">{fmtIdr(weekly.totalPieceEarnings ?? 0)}</span>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-xs">Riwayat Input (My Input = My Gaji)</CardTitle></CardHeader>
        <CardContent className="p-0">
          {prods.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">Belum ada produksi. Input di kiosk supaya gaji terhitung.</div>
          ) : (
            <div className="divide-y">
              {prods.map((p) => (
                <div key={p.id} className="p-3 flex justify-between items-center">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">{p.productName}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{p.orderNumber} • {p.machineName}</div>
                    <div className="text-[10px] text-muted-foreground">{new Date(p.startTime).toLocaleString('id-ID')}</div>
                  </div>
                  <div className="text-right ml-3 shrink-0">
                    <div className="text-xs font-bold">{p.quantity} Kg</div>
                    {p.pieceEarnings != null && <div className="text-[10px] text-emerald-600">{fmtIdr(p.pieceEarnings)}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-[11px] text-muted-foreground bg-muted/40 rounded-xl p-3">
        💡 Tips: Setiap input produksi di kiosk akan langsung menambah estimasi gaji minggu ini. Pastikan operator & helper terisi benar supaya upah terbagi sesuai.
      </div>
    </div>
  );
}
