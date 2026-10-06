import Link from 'next/link';
import { getMaintenanceRequests } from '@/actions/production/maintenance';
import { MobileSectionHeader } from '@/components/mobile';
import { MobileReadError } from '@/components/mobile/MobileReadError';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Maintenance Mobile | PolyFlow' };

export default async function MobileMaintenancePage() {
  const res = await getMaintenanceRequests();
  if (!res.success) return <MobileReadError title="Daftar maintenance belum tersedia" />;
  const open = res.data.filter((r) => r.status !== 'DONE' && r.status !== 'CANCELLED' && r.status !== 'REJECTED');
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <MobileSectionHeader title="Maintenance" level={1} />
        <Link href="/production/mobile/maintenance/new" className="rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white">+ Lapor</Link>
      </div>
      <p className="text-sm text-muted-foreground">Laporan terbuka semua mesin. Klik untuk proses.</p>
      {open.map((r) => (
        <Link key={r.id} href={'/production/maintenance/' + r.id} className="block rounded-xl border bg-card p-4">
          <div className="font-semibold">{r.orderNumber} · {r.machine.code} · {r.urgency}</div>
          <div className="text-sm">{r.status}{r.assigneeName ? ' · ' + r.assigneeName : ''}</div>
        </Link>
      ))}
      {!open.length && <p className="py-4 text-sm">Tidak ada laporan terbuka. 🎉</p>}
    </div>
  );
}
