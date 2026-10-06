import Link from 'next/link';
import { getMaterialOrders } from '@/actions/production/material-orders';
import { MobileReadError } from '@/components/mobile/MobileReadError';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Material Order | PolyFlow' };

export default async function MaterialOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const res = await getMaterialOrders(sp?.status);
  if (!res.success) return <MobileReadError title="Daftar Material Order belum tersedia" />;
  const rows = res.data;
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Material Order</h1>
        <Link href="/production/mobile/material-orders/new" className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">+ Buat</Link>
      </div>
      <p className="text-sm text-muted-foreground">Semua divisi dalam satu menu. Pembuat submit - Kepala Pabrik/Admin setujui - Owner otomatis FYI. Gudang memproses yang APPROVED.</p>
      <div className="flex gap-3 text-sm">
        <Link className="underline" href="/production/material-orders">Semua</Link>
        <Link className="underline" href="/production/material-orders?status=PENDING">Pending</Link>
        <Link className="underline" href="/production/material-orders?status=APPROVED">Approved</Link>
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <Link key={r.id} href={'/production/material-orders/' + r.id} className="block rounded-xl border p-4">
            <div className="font-semibold">{r.orderNumber} · {r.orderType} · {r.status}</div>
            <div className="text-sm text-muted-foreground">{r.itemCount} item</div>
          </Link>
        ))}
        {!rows.length && <p className="text-sm">Belum ada order.</p>}
      </div>
    </div>
  );
}
