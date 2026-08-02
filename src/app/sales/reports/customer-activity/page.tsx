import { getSalesCustomerActivityReport } from '@/actions/sales/customer-activity-report';
import { CustomerActivityReportClient } from './CustomerActivityReportClient';
import { UrlTransactionDateFilter } from '@/components/common/url-transaction-date-filter';
import { parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

export default async function SalesCustomerActivityReportPage({
    searchParams,
}: {
    searchParams: Promise<{
        startDate?: string;
        endDate?: string;
        dormantThresholdDays?: string;
    }>;
}) {
    const params = await searchParams;
    const now = new Date();
    const defaultStart = startOfMonth(now);
    const defaultEnd = endOfMonth(now);

    const checkStart = params?.startDate
        ? parseISO(params.startDate)
        : defaultStart;
    const checkEnd = params?.endDate ? parseISO(params.endDate) : defaultEnd;
    const dormantThresholdDays = params?.dormantThresholdDays
        ? parseInt(params.dormantThresholdDays, 10)
        : 60;

    const res = await getSalesCustomerActivityReport(
        checkStart,
        checkEnd,
        dormantThresholdDays,
    );
    const data =
        res.success && res.data
            ? (res.data as unknown as {
                  startDate: string;
                  endDate: string;
                  dormantThresholdDays: number;
                  summary: {
                      dormantCount: number;
                      newCount: number;
                      lostCount: number;
                      totalCustomersInScope: number;
                  };
                  dormantCustomers: Array<{
                      customerId: string;
                      customerName: string;
                      lastOrderDate: string | null;
                      lastVisitDate: string | null;
                      isAlsoNotVisited: boolean;
                      orderCount: number;
                  }>;
                  newCustomers: Array<{
                      customerId: string;
                      customerName: string;
                      createdAt: string;
                  }>;
                  lostCustomers: Array<{
                      customerId: string;
                      customerName: string;
                      lastOrderDate: string | null;
                      previousOrderCount: number;
                  }>;
              })
            : null;

    const periodLabel = `${format(checkStart, 'd MMM', { locale: idLocale })} – ${format(checkEnd, 'd MMM yyyy', { locale: idLocale })}`;

    if (!data) {
        const isUnauthorized =
            res.success === false &&
            typeof res.error === 'string' &&
            res.error.toLowerCase().includes('unauthorized');

        return (
            <div className="p-6 space-y-6">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">
                            Laporan Aktivitas Customer
                        </h1>
                        <p className="text-muted-foreground">
                            Customer dormant, baru, dan hilang. Periode:{' '}
                            {periodLabel}.
                        </p>
                    </div>
                    <UrlTransactionDateFilter defaultPreset="this_month" />
                </div>
                {isUnauthorized ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800/50 dark:bg-amber-900/20 dark:text-amber-200">
                        Anda tidak punya akses ke laporan aktivitas customer.
                        Hubungi admin/manager.
                    </div>
                ) : (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-200">
                        Gagal memuat laporan aktivitas customer. Coba muat ulang
                        halaman.
                        {res.success === false && res.error
                            ? ` (${res.error})`
                            : ''}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        Laporan Aktivitas Customer
                    </h1>
                    <p className="text-muted-foreground">
                        Customer dormant, baru, dan hilang. Periode:{' '}
                        {periodLabel}.
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                        Threshold dormant:{' '}
                        {data.dormantThresholdDays} hari tanpa order. Customer
                        dormant yang juga tidak dikunjungi = prioritas
                        paling actionable.
                    </p>
                </div>
                <UrlTransactionDateFilter defaultPreset="this_month" />
            </div>

            <CustomerActivityReportClient
                data={data}
            />
        </div>
    );
}
