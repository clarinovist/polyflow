import { getMaterialOrderDetail } from '@/actions/production/material-orders';
import { MobileReadError } from '@/components/mobile/MobileReadError';
import { MaterialOrderActions } from './actions';

export const dynamic = 'force-dynamic';

export default async function MaterialOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await getMaterialOrderDetail(id);
  if (!res.success) return <MobileReadError title="Detail Material Order belum tersedia" />;
  const order = res.data;
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-xl font-bold">{order.orderNumber} · {order.orderType}</h1>
      <p className="text-sm text-muted-foreground">Status: {order.status}</p>
      <table className="w-full text-sm">
        <thead><tr className="text-left"><th>Material</th><th>Jumlah</th><th>Zak</th><th>Ket</th></tr></thead>
        <tbody>
          {order.items.map((it: { id: string; productVariantId: string; quantity: unknown; zakQuantity: unknown; note: string | null }) => (
            <tr key={it.id} className="border-t"><td>{it.productVariantId}</td><td>{String(it.quantity)}</td><td>{it.zakQuantity ? String(it.zakQuantity) : '-'}</td><td>{it.note || '-'}</td></tr>
          ))}
        </tbody>
      </table>
      <MaterialOrderActions id={order.id} />
    </div>
  );
}
