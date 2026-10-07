import { getPurchasingMobileOverview } from '@/actions/purchasing/mobile-dashboard';
import {
    MobileDataFreshness,
    MobileEmptyState,
    MobileInsightCard,
    MobileReadError,
    MobileSectionHeader,
} from '@/components/mobile';
import { formatQuantity, formatRupiah } from '@/lib/utils/utils';

export default async function PurchasingInsightsPage() {
    const response = await getPurchasingMobileOverview('ALL');
    if (!response.success) {
        return <MobileReadError title="Insight purchasing belum tersedia" />;
    }
    const overview = response.data;
    const { highlights } = overview;

    return (
        <div className="min-w-0 space-y-6">
            <MobileSectionHeader title="Insight Purchasing" level={1} className="px-0" />
            <MobileDataFreshness generatedAt={overview.generatedAt} />
            <div className="grid grid-cols-2 gap-3">
                <MobileInsightCard insight={{ key: 'overdue-ap', label: 'AP Overdue', value: highlights.overdueApCount, severity: highlights.overdueApCount ? 'CRITICAL' : 'SUCCESS' }} />
                <MobileInsightCard insight={{ key: 'suggested-reorder', label: 'Suggested Reorder', value: highlights.suggestedReorderCount, severity: highlights.suggestedReorderCount ? 'WARNING' : 'SUCCESS' }} />
            </div>
            {'overdueApAmount' in highlights && (
                <p className="rounded-xl border bg-card p-4 text-sm">Total sisa AP overdue: <strong>{formatRupiah(highlights.overdueApAmount)}</strong></p>
            )}
            <section className="space-y-3" aria-labelledby="reorder-heading">
                <div className="flex items-baseline justify-between gap-3">
                    <h2 id="reorder-heading" className="min-w-0 font-semibold">Stok di bawah reorder point</h2>
                    <span className="shrink-0 text-xs text-muted-foreground">{overview.suggestedReorder.returned} dari {overview.suggestedReorder.total}</span>
                </div>
                {overview.suggestedReorder.items.length === 0 ? (
                    <MobileEmptyState title="Tidak ada suggested reorder" description="Stok internal yang dipantau masih memenuhi reorder point." className="rounded-xl border bg-card" />
                ) : (
                    <div className="space-y-3">
                        {overview.suggestedReorder.items.map((item) => (
                            <article key={item.id} className="rounded-xl border bg-card p-4 [overflow-wrap:anywhere]">
                                <h3 className="font-semibold">{item.name}</h3>
                                <p className="text-xs text-muted-foreground">{item.skuCode} · {item.supplierName ?? 'Supplier belum ditetapkan'}</p>
                                <p className="mt-2 text-sm">Stok {formatQuantity(item.totalStock)} {item.unit} · reorder point {formatQuantity(item.reorderPoint)} {item.unit}</p>
                                {item.reorderQuantity != null && <p className="text-sm font-medium">Saran beli {formatQuantity(item.reorderQuantity)} {item.unit}</p>}
                            </article>
                        ))}
                    </div>
                )}
                <p className="text-xs text-muted-foreground">Perhitungan hanya memakai lokasi stok internal yang berlaku untuk alert; customer-owned stock tidak dihitung.</p>
            </section>
        </div>
    );
}
