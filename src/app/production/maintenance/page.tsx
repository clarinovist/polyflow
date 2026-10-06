import Link from 'next/link';
import { getMaintenanceRequests } from '@/actions/production/maintenance';
import { MobileReadError } from '@/components/mobile/MobileReadError';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Maintenance | PolyFlow' };

export default async function MaintenancePage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const res = await getMaintenanceRequests(sp?.status);
  if (!res.success) return <MobileReadError title="Daftar maintenance belum tersedia" />;
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Maintenance</h1>
        <Link href="/production/mobile/maintenance/new" className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">+ Lapor</Link>
      </div>
      <p className="text-sm text-muted-foreground">Lapor kerusakan - Kepala Pabrik setujui + tunjuk teknisi - kerjakan sampai selesai. Owner otomatis FYI.</p>
      <div className="flex gap-3 text-sm">
        <Link className="underline" href="/production/maintenance">Semua</Link>
        <Link className="underline" href="/production/maintenance?status=PENDING">Pending</Link>
        <Link className="underline" href="/production/maintenance?status=IN_PROGRESS">Dikerjakan</Link>
        <Link className="underline" href="/production/maintenance?status=DONE">Selesai</Link>
      </div>
      <div className="space-y-2">
        {res.data.map((r) => (
          <Link key={r.id} href={'/production/maintenance/' + r.id} className="block rounded-xl border p-4">
            <div className="font-semibold">{r.orderNumber} · {r.machine.code} · {r.urgency}</div>
            <div className="text-sm text-muted-foreground">{r.status}{r.assigneeName ? ' · ' + r.assigneeName : ''}</div>
          </Link>
        ))}
        {!res.data.length && <p className="text-sm">Belum ada laporan.</p>}
      </div>
    </div>
  );
}
