import { getSalesMarginReport } from '@/actions/sales/margin-report';
import { MarginReportClient } from './MarginReportClient';
import { UrlTransactionDateFilter } from '@/components/common/url-transaction-date-filter';
import { ContextualHelp } from '@/components/support/contextual-help';
import { parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

export default async function SalesMarginReportPage({
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

    const res = await getSalesMarginReport(checkStart, checkEnd);
    const data =
        res.success && res.data
            ? (res.data as unknown as {
                  startDate: string;
                  endDate: string;
                  summary: {
                      totalRevenue: number;
                      totalCost: number;
                      totalMargin: number;
                      marginPercent: number | null;
                      totalOrders: number;
                      totalCustomerCount: number;
                      ordersWithIncompleteHpp: number;
                      ordersWithNoHpp: number;
                      variantWithoutHppCount: number;
                  };
                  orders: Array<{
                      id: string;
                      orderNumber: string;
                      orderDate: string;
                      customerId: string;
                      customerName: string;
                      salesRepId: string | null;
                      salesRepName: string | null;
                      items: Array<{
                          productVariantId: string;
                          skuCode: string | null;
                          productName: string;
                          quantity: number;
                          revenue: number;
                          hppPerUnit: number | null;
                          cost: number | null;
                          margin: number | null;
                          hppMissing: boolean;
                      }>;
                      revenue: number;
                      cost: number | null;
                      costPartial: number;
                      margin: number | null;
                      marginPartial: number | null;
                      marginPercent: number | null;
                      hppCoverage: 'FULL' | 'PARTIAL' | 'NONE';
                      hasIncompleteHpp: boolean;
                  }>;
                  byCustomer: Array<{
                      customerId: string;
                      customerName: string;
                      revenue: number;
                      cost: number;
                      margin: number;
                      marginPercent: number | null;
                      isNegativeMargin: boolean;
                      orderCount: number;
                      hppCoverage: 'FULL' | 'PARTIAL' | 'NONE';
                      ordersWithIncompleteHpp: number;
                  }>;
                  byProduct: Array<{
                      productVariantId: string;
                      skuCode: string | null;
                      productName: string;
                      quantity: number;
                      revenue: number;
                      cost: number | null;
                      margin: number | null;
                      marginPercent: number | null;
                      isNegativeMargin: boolean;
                      hasMissingHpp: boolean;
                      orderCount: number;
                  }>;
                  bySales: Array<{
                      salesRepId: string;
                      salesRepName: string;
                      revenue: number;
                      cost: number;
                      margin: number;
                      marginPercent: number | null;
                      isNegativeMargin: boolean;
                      orderCount: number;
                      hppCoverage: 'FULL' | 'PARTIAL' | 'NONE';
                      ordersWithIncompleteHpp: number;
                  }>;
                  hppMap: Array<{
                      variantId: string;
                      hppPerUnit: number;
                      totalQuantity: number;
                  }>;
                  variantWithoutHpp: string[];
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
                            Laporan Margin
                        </h1>
                        <p className="text-muted-foreground">
                            Pendapatan – HPP per SO, customer, produk, dan
                            sales. Periode: {periodLabel}.
                        </p>
                    </div>
                    <UrlTransactionDateFilter defaultPreset="this_month" />
                </div>
                {isUnauthorized ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800/50 dark:bg-amber-900/20 dark:text-amber-200">
                        Anda tidak punya akses ke laporan margin. Hubungi
                        admin/manager.
                    </div>
                ) : (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-200">
                        Gagal memuat laporan margin. Coba muat ulang halaman.
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
                        Laporan Margin
                    </h1>
                    <p className="text-muted-foreground">
                        Pendapatan – HPP per SO, customer, produk, dan sales.
                        Periode: {periodLabel}.
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                        HPP = rata-rata tertimbang per varian dari production
                        order COMPLETED/IN_PROGRESS dalam periode ini. Baris
                        dengan badge kuning = HPP tidak lengkap/tidak tersedia
                        (bukan margin 0/100%).
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <ContextualHelp
                        title="Panduan Laporan Margin"
                        prefillQuestion="Cara baca laporan margin di Polyflow?"
                        links={[
                            {
                                title: 'Laporan Performa Penjualan',
                                slug: 'laporan-performa-penjualan',
                            },
                        ]}
                    />
                    <UrlTransactionDateFilter defaultPreset="this_month" />
                </div>
            </div>

            <MarginReportClient data={data} periodLabel={periodLabel} />
        </div>
    );
}
