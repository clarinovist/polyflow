import { getPurchasingMobileOverview } from '@/actions/purchasing/mobile-dashboard';
import {
    MobileDataFreshness,
    MobileReadError,
    MobileSectionHeader,
} from '@/components/mobile';
import {
    PurchasingQueueFilters,
    PurchasingSectionNotice,
    PurchasingTaskQueue,
} from '../purchasing-mobile-view';

export default async function PurchasingTasksPage({
    searchParams,
}: {
    searchParams?: Promise<{ filter?: string }>;
} = {}) {
    const filter = (await searchParams)?.filter;
    const response = await getPurchasingMobileOverview(filter);
    if (!response.success) {
        return <MobileReadError title="Antrean purchasing belum tersedia" />;
    }
    const overview = response.data;

    return (
        <div className="min-w-0 space-y-5">
            <MobileSectionHeader
                title="Antrean Purchasing"
                level={1}
                className="px-0"
            />
            <MobileDataFreshness generatedAt={overview.generatedAt} />
            <PurchasingSectionNotice sections={overview.sections} />
            <PurchasingQueueFilters current={overview.filter} />
            <p className="text-sm text-muted-foreground">
                Menampilkan {overview.queue.returned} dari{' '}
                {overview.queue.total ?? '—'} exception pada filter ini. Antrean
                dibatasi 10 item dan bersifat read-only.
            </p>
            <PurchasingTaskQueue items={overview.queue.items} />
            <p className="text-xs text-muted-foreground">
                Approval PR, perubahan PO, dan penerimaan barang tetap melalui
                alur desktop/warehouse yang memiliki guard transaksi.
            </p>
        </div>
    );
}
