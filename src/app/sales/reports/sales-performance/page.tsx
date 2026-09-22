import { getSalesPerformanceReport } from '@/actions/sales/sales-reports';
import { SalesMetricInfo } from '@/components/sales/SalesMetricInfo';
import { SalesPerformanceReportClient } from '@/components/sales/reports/SalesPerformanceReportClient';
import { UrlTransactionDateFilter } from '@/components/common/url-transaction-date-filter';
import { parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

export default async function SalesPerformanceReportPage({
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

    const res = await getSalesPerformanceReport({
        startDate: checkStart,
        endDate: checkEnd,
    });
    const data = res.success && res.data ? res.data : null;

    const periodLabel = `${format(checkStart, 'd MMM', { locale: idLocale })} – ${format(checkEnd, 'd MMM yyyy', { locale: idLocale })}`;

    return (
        <div className="p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-1">
                        <h1 className="text-3xl font-bold tracking-tight">
                            Laporan Performa Penjualan
                        </h1>
                        <SalesMetricInfo label="Info omzet laporan penjualan">
                            Omzet adalah total nilai SO non-batal berdasarkan
                            tanggal pesanan (orderDate) dalam periode pilihan,
                            bukan invoice yang sudah lunas.
                        </SalesMetricInfo>
                    </div>
                    <p className="text-muted-foreground">
                        Omzet per periode, top customer, top produk, dan detail
                        order. Periode: {periodLabel}.
                    </p>
                </div>
                <UrlTransactionDateFilter defaultPreset="this_month" />
            </div>

            {/* P0 fix: server fetch ikut date url + period label */}
            <SalesPerformanceReportClient
                initialData={data}
                periodLabel={periodLabel}
                start={checkStart}
                end={checkEnd}
            />
        </div>
    );
}
