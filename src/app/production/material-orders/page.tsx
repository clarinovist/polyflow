import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getStatusLabel } from '@/lib/labels/helpers';
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
    <div className="min-w-0 space-y-6">
      <PageHeader title="Permintaan Bahan" description="Permintaan seluruh divisi. Kepala Pabrik atau Admin menyetujui sebelum diproses gudang." actions={<Button asChild><Link href="/production/mobile/material-orders/new">Buat Permintaan</Link></Button>} />
      <div className="flex gap-3 text-sm">
        <Link className="underline" href="/production/material-orders">Semua</Link>
        <Link className="underline" href="/production/material-orders?status=PENDING">Menunggu Persetujuan</Link>
        <Link className="underline" href="/production/material-orders?status=APPROVED">Disetujui</Link>
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <Link key={r.id} href={'/production/material-orders/' + r.id} className="block rounded-xl border p-4">
            <div className="font-semibold">{r.orderNumber} · {r.orderType} <Badge variant="outline">{getStatusLabel(r.status)}</Badge></div>
            <div className="text-sm text-muted-foreground">{r.itemCount} item</div>
          </Link>
        ))}
        {!rows.length && <p className="text-sm text-muted-foreground">{sp?.status ? 'Tidak ada permintaan sesuai filter status.' : 'Belum ada permintaan bahan.'}</p>}
      </div>
    </div>
  );
}
