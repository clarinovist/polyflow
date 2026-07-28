import React from 'react';
import { getPurchasingMobileOverview } from '@/actions/purchasing/mobile-dashboard';
import { MobileInsightCard, MobileSectionHeader } from '@/components/mobile';

export default async function PurchasingMobilePage() {
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
            <MobileSectionHeader title="Purchasing Pulse Hari Ini" />

            <div className="grid grid-cols-2 gap-3">
                <MobileInsightCard
                    insight={{
                        key: 'draft-po',
                        label: 'Draft PO',
                        value: highlights.draftPoCount,
                        severity: highlights.draftPoCount > 0 ? 'WARNING' : 'INFO',
                    }}
                />
                <MobileInsightCard
                    insight={{
                        key: 'waiting-receipt',
                        label: 'PO Menunggu Penerimaan',
                        value: highlights.waitingReceiptCount,
                        severity: 'SUCCESS',
                    }}
                />
                <MobileInsightCard
                    insight={{
                        key: 'overdue-ap',
                        label: 'Overdue AP Status',
                        value: highlights.overdueApCount,
                        severity: highlights.overdueApCount > 0 ? 'CRITICAL' : 'SUCCESS',
                    }}
                />
                <MobileInsightCard
                    insight={{
                        key: 'active-orders',
                        label: 'PO Aktif',
                        value: overview?.recentOrders.length ?? 0,
                        severity: 'INFO',
                    }}
                />
            </div>
        </div>
    );
}
