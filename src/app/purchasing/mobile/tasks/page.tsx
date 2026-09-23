import { getPurchasingMobileOverview } from '@/actions/purchasing/mobile-dashboard';
import { MobileSectionHeader } from '@/components/mobile';
import { MobileReadError } from '@/components/mobile/MobileReadError';
import { formatRupiah } from '@/lib/utils/utils';

export default async function PurchasingTasksPage() {
    const response = await getPurchasingMobileOverview();
    if (!response.success) return <MobileReadError title="Daftar PO belum tersedia" />;
    const { recentOrders } = response.data;
    return (
        <div className="space-y-4">
            <MobileSectionHeader title="Purchase Order Terbaru" level={1} />
            <p className="text-sm text-muted-foreground">Maksimal 10 PO yang terakhir diperbarui, termasuk yang sudah selesai. Perubahan dan persetujuan tetap melalui desktop purchasing.</p>
            {!recentOrders.length ? <p className="py-4 text-sm">Belum ada PO.</p> : recentOrders.map((po) => (
                <article key={po.id} className="space-y-2 rounded-xl border bg-card p-4 [overflow-wrap:anywhere]">
                    <h2 className="font-semibold">{po.poNumber}</h2>
                    <p className="text-sm">{po.supplierName}</p>
                    <p className="text-sm">Status: {po.status}</p>
                    <p className="text-sm">Total: {po.totalAmount == null ? 'Belum tersedia' : formatRupiah(po.totalAmount)}</p>
                </article>
            ))}
        </div>
    );
}
