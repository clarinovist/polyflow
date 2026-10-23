import { getMaterialOrderDetail } from '@/actions/production/material-orders';
import { MobileReadError } from '@/components/mobile/MobileReadError';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { commonStatusLabels } from '@/lib/labels/status';
import { MaterialOrderActions } from './actions';

export const dynamic = 'force-dynamic';

export default async function MaterialOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const res = await getMaterialOrderDetail(id);
    if (!res.success) return <MobileReadError title="Detail permintaan bahan belum tersedia" />;
    const order = res.data;
    return (
        <div className="mx-auto w-full max-w-3xl space-y-6">
            <PageHeader title={order.orderNumber} description={`Permintaan Bahan · ${order.orderType}`} />
            <Badge variant="outline">{commonStatusLabels[order.status as keyof typeof commonStatusLabels] ?? order.status}</Badge>
            <div className="rounded-xl border bg-card p-4">
                <p className="mb-4 text-sm text-muted-foreground">Jumlah memakai satuan yang dicatat saat permintaan dibuat. Baris lama tanpa satuan tidak dikonversi atau dianggap kg.</p>
                <Table>
                    <TableHeader><TableRow><TableHead>Bahan</TableHead><TableHead className="text-right">Jumlah</TableHead><TableHead className="text-right">Zak</TableHead><TableHead>Catatan</TableHead></TableRow></TableHeader>
                    <TableBody>
                        {order.items.map((item) => (
                            <TableRow key={item.id}>
                                <TableCell><div className="font-medium">{item.material?.name ?? 'Bahan tidak tersedia'}</div><div className="text-xs text-muted-foreground">{item.material?.skuCode ?? 'SKU tidak tersedia'}</div></TableCell>
                                <TableCell className="text-right tabular-nums">{Number(item.quantity).toLocaleString('id-ID', { maximumFractionDigits: 4 })}<div className="text-xs text-muted-foreground">{item.quantityUnit ?? 'Satuan belum dicatat'}</div></TableCell>
                                <TableCell className="text-right tabular-nums">{item.zakQuantity != null ? Number(item.zakQuantity).toLocaleString('id-ID', { maximumFractionDigits: 4 }) : '—'}</TableCell>
                                <TableCell>{item.note || '—'}</TableCell>
                            </TableRow>
                        ))}
                        {!order.items.length && <TableRow><TableCell colSpan={4} className="text-center">Tidak ada bahan pada permintaan ini.</TableCell></TableRow>}
                    </TableBody>
                </Table>
            </div>
            {order.rejectionReason && <p className="text-sm">Alasan penolakan: {order.rejectionReason}</p>}
            <MaterialOrderActions id={order.id} canApprove={order.viewer.canApprove} canReject={order.viewer.canReject} />
        </div>
    );
}
