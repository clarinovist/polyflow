import Link from 'next/link';
import { auth } from '@/auth';
import { isMobileSupervisorOperator } from '@/lib/mobile/mobile-access-policy';
import { commonStatusLabels } from '@/lib/labels/status';
import { getMaterialOrders } from '@/actions/production/material-orders';
import { MobileSectionHeader } from '@/components/mobile';
import { MobileReadError } from '@/components/mobile/MobileReadError';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Material Order Mobile | PolyFlow' };

export default async function MobileMaterialOrdersPage() {
  const session = await auth();
  const canCreate = isMobileSupervisorOperator(session?.user);
  const res = await getMaterialOrders('PENDING');
  if (!res.success) return <MobileReadError title="Antrean Material Order belum tersedia" />;
  const rows = res.data;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <MobileSectionHeader title="Permintaan Bahan" level={1} />
        {canCreate && <Link href="/production/mobile/material-orders/new" className="inline-flex min-h-11 items-center rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">+ Buat</Link>}
      </div>
      <p className="text-sm text-muted-foreground">Permintaan menunggu persetujuan dari semua divisi. Buka detail untuk meninjau bahan; tindakan tersedia sesuai hak akses Anda.</p>
      {rows.map((r) => (
        <Link key={r.id} href={'/production/mobile/material-orders/' + r.id} className="block rounded-xl border bg-card p-4">
          <div className="font-semibold">{r.orderNumber} · {r.orderType}</div>
          <div className="text-sm">Status: {commonStatusLabels[r.status as keyof typeof commonStatusLabels] ?? r.status} · {r.itemCount} item</div>
        </Link>
      ))}
      {!rows.length && <p className="py-4 text-sm">Tidak ada antrean. 🎉</p>}
    </div>
  );
}
