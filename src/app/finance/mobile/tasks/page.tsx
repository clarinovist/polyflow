import { getFinanceMobileOverview } from '@/actions/finance/mobile-dashboard';
import { MobileDataFreshness, MobileSectionHeader } from '@/components/mobile';
import { MobileReadError } from '@/components/mobile/MobileReadError';
import {
    FinanceInvoiceFilters,
    FinanceInvoiceList,
    FinancePagination,
    FinanceSectionNotice,
} from '../finance-mobile-view';

export default async function FinanceTasksPage({
    searchParams,
}: {
    searchParams?: Promise<{
        type?: string;
        due?: string;
        bucket?: string;
        page?: string;
    }>;
} = {}) {
    const input = await searchParams;
    const response = await getFinanceMobileOverview(input);
    if (!response.success)
        return <MobileReadError title="Daftar faktur belum tersedia" />;
    const data = response.data;
    return (
        <div className="min-w-0 space-y-4">
            <MobileSectionHeader title="Antrean AR/AP" level={1} />
            <MobileDataFreshness generatedAt={data.generatedAt} />
            <FinanceSectionNotice sections={data.sections} />
            <FinanceInvoiceFilters query={data.query} />
            <p className="text-sm text-muted-foreground">
                Menampilkan {data.counts.returned} dari{' '}
                {data.counts.total ?? '—'} faktur. Setiap jenis dibatasi{' '}
                {data.counts.pageSizePerType} item per halaman; tiap bagian
                memakai snapshot RepeatableRead mandiri.
            </p>
            <FinanceInvoiceList invoices={data.invoices} />
            <FinancePagination
                query={data.query}
                hasNext={data.counts.hasNext}
                returned={data.counts.returned}
            />
            <p className="text-xs text-muted-foreground">
                Pembayaran, posting jurnal, rekonsiliasi, dan penutupan periode
                tetap melalui desktop Finance.
            </p>
        </div>
    );
}
