import { getSalesInvoices, getInvoiceStats } from '@/actions/finance/invoices';
import { salesLabels } from '@/lib/labels';
import { UrlTransactionDateFilter } from '@/components/common/url-transaction-date-filter';
import { SalesInvoicesShell } from '@/components/sales/SalesInvoicesShell';
import { resolveSalesInvoiceListPeriod } from '@/lib/sales/invoice-period';

export default async function SalesInvoicesPage({
    searchParams,
}: {
    searchParams: Promise<{
        startDate?: string;
        endDate?: string;
        status?: string;
    }>;
}) {
    const params = await searchParams;
    const { dateRange, periodLabel, dateFilterDefaultPreset } =
        resolveSalesInvoiceListPeriod(params);

    const [invoicesRes, statsRes] = await Promise.all([
        getSalesInvoices(dateRange, { operationalOnly: true }),
        getInvoiceStats(dateRange, { operationalOnly: true }),
    ]);

    const invoices =
        invoicesRes.success && invoicesRes.data ? invoicesRes.data : [];
    const stats = statsRes.success && statsRes.data ? statsRes.data : null;

    return (
        <div className="flex flex-col space-y-6 p-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        {salesLabels.salesInvoices}
                    </h1>
                    <p className="text-muted-foreground">
                        {salesLabels.salesInvoicesDesc} • Periode invoice:{' '}
                        {periodLabel}
                    </p>
                </div>
                <UrlTransactionDateFilter
                    defaultPreset={dateFilterDefaultPreset}
                />
            </div>

            <SalesInvoicesShell
                initialInvoices={invoices as never}
                stats={stats as never}
                periodLabel={periodLabel}
                initialStatus={params?.status}
            />
        </div>
    );
}
