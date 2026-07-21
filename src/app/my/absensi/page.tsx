import { getEmployeeSession } from '@/lib/auth/employee-session';
import { redirect } from 'next/navigation';
import { getMyAttendanceMonth } from '@/actions/employee/self';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type AttendanceRes = Awaited<ReturnType<typeof getMyAttendanceMonth>>;
type AttendanceRow = NonNullable<AttendanceRes['data']>[number];

export default async function MyAbsensiPage({ searchParams }: { searchParams: Promise<{ year?: string; month?: string }> }) {
  const session = await getEmployeeSession().catch(() => null);
  if (!session) redirect('/my/login');

  const sp = await searchParams;
  const year = Number(sp.year) || new Date().getFullYear();
  const month = Number(sp.month) || new Date().getMonth() + 1;

  const attRes = await getMyAttendanceMonth(year, month).catch(
    (): AttendanceRes => ({ success: false, error: 'Gagal memuat absensi' }),
  );
  const records: AttendanceRow[] = attRes.data ?? [];

  const present = records.filter((r) => r.status === 'PRESENT').length;
  const absent = records.filter((r) => r.status === 'ABSENT').length;
  const leave = records.filter((r) => r.status === 'ON_LEAVE').length;
  const hours = records.reduce((s, r) => s + (r.actualHours ?? 0), 0);

  const prevMonth = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const nextMonth = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-black">Absensi & Izin</h1>

      <div className="flex justify-between items-center">
        <div className="text-sm font-semibold">
          {new Date(year, month - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
        </div>
        <div className="flex gap-1">
          <a href={`/my/absensi?year=${prevMonth.year}&month=${prevMonth.month}`} className="px-3 py-1.5 rounded-full border text-xs">‹</a>
          <a href={`/my/absensi?year=${nextMonth.year}&month=${nextMonth.month}`} className="px-3 py-1.5 rounded-full border text-xs">›</a>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <Card className="py-0"><CardContent className="p-3"><div className="text-[10px] text-muted-foreground">Hadir</div><div className="font-black text-emerald-600">{present}</div></CardContent></Card>
        <Card className="py-0"><CardContent className="p-3"><div className="text-[10px] text-muted-foreground">Alfa</div><div className="font-black text-rose-600">{absent}</div></CardContent></Card>
        <Card className="py-0"><CardContent className="p-3"><div className="text-[10px] text-muted-foreground">Izin/Cuti</div><div className="font-black text-amber-600">{leave}</div></CardContent></Card>
        <Card className="py-0"><CardContent className="p-3"><div className="text-[10px] text-muted-foreground">Jam</div><div className="font-black">{hours.toFixed(1)}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-xs">Riwayat</CardTitle></CardHeader>
        <CardContent className="p-0">
          {records.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">Tidak ada data bulan ini.</div>
          ) : (
            <div className="divide-y">
              {records.map((r) => (
                <div key={r.id} className="p-3 flex justify-between">
                  <div>
                    <div className="text-xs font-medium">{new Date(r.workDate).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })} • {r.shiftName}</div>
                    <div className="text-[11px] text-muted-foreground">{r.clockInAt ? new Date(r.clockInAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'} - {r.clockOutAt ? new Date(r.clockOutAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '...'}</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-[10px] px-2 py-0.5 rounded-full inline-block ${r.status === 'PRESENT' ? 'bg-emerald-100 text-emerald-700' : r.status === 'ABSENT' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>{r.status}</div>
                    <div className="text-[11px] mt-1">{r.actualHours != null ? `${Number(r.actualHours).toFixed(1)}j` : '-'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
