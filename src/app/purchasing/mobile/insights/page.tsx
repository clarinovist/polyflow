import React from 'react';
import { MobileReadError } from '@/components/mobile/MobileReadError';
import { getPurchasingMobileOverview } from '@/actions/purchasing/mobile-dashboard';
import { MobileSectionHeader, MobileInsightCard } from '@/components/mobile';

export default async function PurchasingInsightsPage() {
    const response = await getPurchasingMobileOverview();
    if (!response.success) return <MobileReadError title="Insight purchasing belum tersedia" />;
    const { highlights } = response.data;

    return (
        <div className="space-y-6">
            <MobileSectionHeader title="Purchasing Insights" level={1} />

            <div className="grid grid-cols-1 gap-3">
                <MobileInsightCard
                    insight={{
                        key: 'overdue-ap-amount',
                        label: 'Total Overdue AP Amount',
                        value: highlights.overdueApAmount.toLocaleString('id-ID'),
                        unit: 'IDR',
                        severity: highlights.overdueApAmount > 0 ? 'CRITICAL' : 'SUCCESS',
                    }}
                />
                <MobileInsightCard
                    insight={{
                        key: 'draft-po-count',
                        label: 'Draft PO Terpilih',
                        value: highlights.draftPoCount,
                        unit: 'PO',
                        severity: highlights.draftPoCount > 0 ? 'WARNING' : 'INFO',
                    }}
                />
                <MobileInsightCard
                    insight={{
                        key: 'waiting-receipt-count',
                        label: 'PO Menunggu GR',
                        value: highlights.waitingReceiptCount,
                        unit: 'PO',
                        severity: 'SUCCESS',
                    }}
                />
            </div>
        </div>
    );
}
