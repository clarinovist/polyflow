import Link from 'next/link';
import { commonStatusLabels } from '@/lib/labels/status';
import { getMaterialOrders } from '@/actions/production/material-orders';
import { MobileSectionHeader } from '@/components/mobile';
import { MobileReadError } from '@/components/mobile/MobileReadError';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Material Order Mobile | PolyFlow' };

export default async function MobileMaterialOrdersPage() {
  const res = await getMaterialOrders('PENDING');
  if (!res.success) return <MobileReadError title="Antrean Material Order belum tersedia" />;
  const rows = res.data;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <MobileSectionHeader title="Permintaan Bahan" level={1} />
        <Link href="/production/mobile/material-orders/new" className="rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white">+ Buat</Link>
      </div>
      <p className="text-sm text-muted-foreground">Permintaan menunggu persetujuan dari semua divisi. Detail dan persetujuan dibuka melalui desktop.</p>
      {rows.map((r) => (
        <Link key={r.id} href={'/device/desktop-required?from=' + encodeURIComponent('/production/material-orders/' + r.id)} className="block rounded-xl border bg-card p-4">
          <div className="font-semibold">{r.orderNumber} · {r.orderType}</div>
          <div className="text-sm">Status: {commonStatusLabels[r.status as keyof typeof commonStatusLabels] ?? r.status} · {r.itemCount} item</div>
        </Link>
      ))}
      {!rows.length && <p className="py-4 text-sm">Tidak ada antrean. 🎉</p>}
    </div>
  );
}
