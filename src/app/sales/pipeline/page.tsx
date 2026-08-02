import { getSalesPipeline } from '@/actions/sales/pipeline';
import { PipelineBoardClient } from './PipelineBoardClient';
import { UrlTransactionDateFilter } from '@/components/common/url-transaction-date-filter';
import { ContextualHelp } from '@/components/support/contextual-help';
import { parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

export default async function SalesPipelinePage({
    searchParams,
}: {
    searchParams: Promise<{ startDate?: string; endDate?: string }>;
}) {
    const params = await searchParams;
    const now = new Date();
    const defaultStart = startOfMonth(now);
    const defaultEnd = endOfMonth(now);

    const checkStart = params?.startDate
        ? parseISO(params.startDate)
        : defaultStart;
    const checkEnd = params?.endDate ? parseISO(params.endDate) : defaultEnd;

    const res = await getSalesPipeline(checkStart, checkEnd);
    const data = res.success && res.data ? res.data : null;

    const periodLabel = `${format(checkStart, 'd MMM', { locale: idLocale })} – ${format(checkEnd, 'd MMM yyyy', { locale: idLocale })}`;

    // Fallback when no data or error
    if (!data) {
        return (
            <div className="p-6 space-y-6">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">
                            Pipeline Penawaran
                        </h1>
                        <p className="text-muted-foreground">
                            Papan kanban read-only penawaran per status.
                            Periode: {periodLabel}.
                        </p>
                    </div>
                    <UrlTransactionDateFilter defaultPreset="this_month" />
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800/50 dark:bg-amber-900/20 dark:text-amber-200">
                    Gagal memuat pipeline. Coba muat ulang halaman.
                    {res.success === false && res.error
                        ? ` (${res.error})`
                        : ''}
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        Pipeline Penawaran
                    </h1>
                    <p className="text-muted-foreground">
                        Papan kanban read-only penawaran per status. Periode:{' '}
                        {periodLabel}. Scope ikut assignment sales kalau Anda
                        bukan ADMIN/MARKETING.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <ContextualHelp
                        title="Panduan Pipeline"
                        prefillQuestion="Cara pakai papan Pipeline Penawaran di Polyflow?"
                        links={[
                            {
                                title: 'Cara Buat Penawaran',
                                slug: 'cara-buat-penawaran',
                            },
                            {
                                title: 'Cara Follow-up Penawaran',
                                slug: 'cara-follow-up-penawaran',
                            },
                        ]}
                    />
                    <UrlTransactionDateFilter defaultPreset="this_month" />
                </div>
            </div>

            <PipelineBoardClient data={data} periodLabel={periodLabel} />
        </div>
    );
}
