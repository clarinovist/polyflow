import React from 'react';
import { getPurchasingMobileOverview } from '@/actions/purchasing/mobile-dashboard';
import { MobileSectionHeader, MobileInsightCard } from '@/components/mobile';

export default async function PurchasingInsightsPage() {
    const response = await getPurchasingMobileOverview();
    const overview = response.success ? response.data : null;
    const highlights = overview?.highlights ?? {
        pendingPrCount: 0,
        draftPoCount: 0,
        waitingReceiptCount: 0,
        overdueApCount: 0,
        overdueApAmount: 0,
    };

    return (
        <div className="space-y-6">
            <MobileSectionHeader title="Purchasing Insights" />

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
