import { getMaklonReport, getMaklonCustomers } from '@/actions/maklon/maklon-report';
import { MaklonReportClient } from '@/components/maklon/MaklonReportClient';
import { Factory } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function MaklonReportPage() {
    const [reportRes, customersRes] = await Promise.all([
        getMaklonReport(),
        getMaklonCustomers(),
    ]);

    const report = reportRes.success && reportRes.data
        ? reportRes.data
        : {
              totalOrders: 0,
              totalServiceRevenue: 0,
              totalInternalCost: 0,
              totalGrossMargin: 0,
              avgMarginPct: 0,
              byCustomer: [],
              totalCostBreakdown: {
                  LABOR: 0,
                  MACHINE: 0,
                  ELECTRICITY: 0,
                  ADDITIVE: 0,
                  COLORANT: 0,
                  OVERHEAD: 0,
                  OTHER: 0,
              },
          };

    const customers =
        customersRes.success && customersRes.data ? customersRes.data : [];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
                    <Factory className="h-7 w-7 text-purple-600" />
                    Maklon Profitability Report
                </h1>
                <p className="text-sm md:text-base text-muted-foreground mt-1">
                    Track service revenue, internal conversion costs, and gross margin per Maklon order.
                </p>
            </div>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <MaklonReportClient initialReport={report as any} customers={customers} />
        </div>
    );
}
