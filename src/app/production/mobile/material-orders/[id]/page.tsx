import Link from 'next/link';
import { getMaterialOrderDetail } from '@/actions/production/material-orders';
import { MaterialOrderActions } from '@/app/production/material-orders/[id]/actions';
import { MobileReadError } from '@/components/mobile/MobileReadError';
import { MobileSectionHeader } from '@/components/mobile/MobileSectionHeader';
import { Badge } from '@/components/ui/badge';
import { getStatusLabel } from '@/lib/labels/helpers';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Detail Permintaan Bahan | PolyFlow' };

export default async function MobileMaterialOrderPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const result = await getMaterialOrderDetail(id);
    if (!result.success) return <MobileReadError title="Permintaan bahan gagal dimuat" />;
    const order = result.data;
    return (
        <div className="min-w-0 space-y-4">
            <Link href="/production/mobile/material-orders" className="inline-flex min-h-11 items-center text-sm text-primary">← Permintaan Bahan</Link>
            <MobileSectionHeader title={order.orderNumber} level={1} />
            <div className="flex flex-wrap items-center gap-2 text-sm"><span>{order.orderType}</span><Badge variant="outline">{getStatusLabel(order.status)}</Badge></div>
            <p className="text-xs text-muted-foreground">Jumlah mengikuti satuan yang dicatat saat permintaan dibuat. Satuan baris lama yang belum tercatat tidak diasumsikan kg; verifikasi dokumen asal sebelum menyetujui.</p>
            <ul className="space-y-3" aria-label="Bahan diminta">
                {order.items.map((item) => (
                    <li key={item.id} className="rounded-xl border bg-card p-4 space-y-2">
                        <h2 className="font-semibold break-words">{item.material?.name ?? 'Bahan tidak tersedia'}</h2>
                        <p className="text-xs text-muted-foreground">{item.material?.skuCode ?? 'SKU tidak tersedia'}</p>
                        <dl className="grid grid-cols-2 gap-2 text-sm">
                            <div><dt className="text-muted-foreground">Jumlah</dt><dd className="font-semibold">{Number(item.quantity).toLocaleString('id-ID', { maximumFractionDigits: 4 })} {item.quantityUnit ?? '(satuan belum dicatat)'}</dd></div>
                            <div><dt className="text-muted-foreground">Zak</dt><dd>{item.zakQuantity == null ? '—' : Number(item.zakQuantity).toLocaleString('id-ID', { maximumFractionDigits: 4 })}</dd></div>
                        </dl>
                        {item.note && <p className="text-sm break-words">{item.note}</p>}
                    </li>
                ))}
            </ul>
            {order.notes && <p className="rounded-xl border p-4 text-sm whitespace-pre-wrap">{order.notes}</p>}
            {order.rejectionReason && <p role="status" className="text-sm">Alasan penolakan: {order.rejectionReason}</p>}
            <MaterialOrderActions id={order.id} canApprove={order.viewer.canApprove} canReject={order.viewer.canReject} />
        </div>
    );
}
