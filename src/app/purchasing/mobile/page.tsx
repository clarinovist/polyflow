import Link from 'next/link';
import { getPurchasingMobileOverview } from '@/actions/purchasing/mobile-dashboard';
import {
    MobileDataFreshness,
    MobileInsightCard,
    MobileReadError,
    MobileSectionHeader,
} from '@/components/mobile';
import { PurchasingTaskQueue } from './purchasing-mobile-view';
import { formatRupiah } from '@/lib/utils/utils';

export default async function PurchasingMobilePage() {
    const response = await getPurchasingMobileOverview('ALL');
    if (!response.success) {
        return <MobileReadError title="Ringkasan purchasing belum tersedia" />;
    }
    const overview = response.data;
    const { highlights } = overview;

    return (
        <div className="min-w-0 space-y-6">
            <MobileSectionHeader
                title="Purchasing Hari Ini"
                level={1}
                className="px-0"
            />
            <MobileDataFreshness generatedAt={overview.generatedAt} />
            <div className="grid grid-cols-2 gap-3">
                <MobileInsightCard insight={{ key: 'pending-pr', label: 'PR Perlu Diproses', value: highlights.pendingRequestCount, severity: highlights.pendingRequestCount ? 'WARNING' : 'SUCCESS' }} />
                <MobileInsightCard insight={{ key: 'draft-po', label: 'Draft PO', value: highlights.draftPoCount, severity: highlights.draftPoCount ? 'WARNING' : 'SUCCESS' }} />
                <MobileInsightCard insight={{ key: 'waiting-receipt', label: 'Menunggu Penerimaan', value: highlights.waitingReceiptCount, severity: highlights.waitingReceiptCount ? 'WARNING' : 'SUCCESS' }} />
                <MobileInsightCard insight={{ key: 'eta-exception', label: 'ETA Terlewat', value: highlights.etaExceptionCount, severity: highlights.etaExceptionCount ? 'CRITICAL' : 'SUCCESS' }} />
            </div>
            <section className="rounded-xl border bg-card p-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <p className="text-muted-foreground">AP overdue</p>
                        <p className="text-lg font-bold tabular-nums">{highlights.overdueApCount} invoice</p>
                    </div>
                    {'overdueApAmount' in highlights && (
                        <p className="text-right font-semibold">{formatRupiah(highlights.overdueApAmount)}</p>
                    )}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Nominal hanya dikirim server ketika izin harga tersedia.</p>
            </section>
            <section className="space-y-3" aria-labelledby="purchasing-priority-heading">
                <div className="flex items-center justify-between gap-3">
                    <h2 id="purchasing-priority-heading" className="font-semibold">Prioritas awal</h2>
                    <Link href="/purchasing/mobile/tasks" className="inline-flex min-h-11 items-center text-xs font-semibold text-blue-700 dark:text-blue-300">Lihat antrean</Link>
                </div>
                <PurchasingTaskQueue items={overview.queue.items.slice(0, 3)} />
                <p className="text-xs text-muted-foreground">Menampilkan {Math.min(overview.queue.returned, 3)} dari {overview.queue.total} exception.</p>
            </section>
        </div>
    );
}
