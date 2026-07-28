import React from 'react';
import { getFinanceMobileOverview } from '@/actions/finance/mobile-dashboard';
import { MobileSectionHeader, MobileInsightCard } from '@/components/mobile';

export default async function FinanceInsightsPage() {
    const response = await getFinanceMobileOverview();
    const overview = response.success ? response.data : null;
    const highlights = overview?.highlights ?? {
        overdueArCount: 0,
        overdueArAmount: 0,
        overdueApCount: 0,
        overdueApAmount: 0,
        draftJournalCount: 0,
        openReconCount: 0,
    };

    return (
        <div className="space-y-6">
            <MobileSectionHeader title="Finance Insights" />

            <div className="grid grid-cols-1 gap-3">
                <MobileInsightCard
                    insight={{
                        key: 'overdue-ar-amount',
                        label: 'Total Overdue AR (Piutang)',
                        value: highlights.overdueArAmount.toLocaleString('id-ID'),
                        unit: 'IDR',
                        severity: highlights.overdueArAmount > 0 ? 'WARNING' : 'SUCCESS',
                    }}
                />
                <MobileInsightCard
                    insight={{
                        key: 'overdue-ap-amount',
                        label: 'Total Overdue AP (Hutang)',
                        value: highlights.overdueApAmount.toLocaleString('id-ID'),
                        unit: 'IDR',
                        severity: highlights.overdueApAmount > 0 ? 'CRITICAL' : 'SUCCESS',
                    }}
                />
                <MobileInsightCard
                    insight={{
                        key: 'draft-journals-count',
                        label: 'Draft Jurnal Pending',
                        value: highlights.draftJournalCount,
                        unit: 'jurnal',
                        severity: highlights.draftJournalCount > 0 ? 'WARNING' : 'INFO',
                    }}
                />
            </div>
        </div>
    );
}
