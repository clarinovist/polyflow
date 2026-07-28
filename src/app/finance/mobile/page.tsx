import React from 'react';
import { getFinanceMobileOverview } from '@/actions/finance/mobile-dashboard';
import { MobileInsightCard, MobileSectionHeader } from '@/components/mobile';

export default async function FinanceMobilePage() {
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
            <MobileSectionHeader title="Finance Pulse Hari Ini" />

            <div className="grid grid-cols-2 gap-3">
                <MobileInsightCard
                    insight={{
                        key: 'overdue-ar-count',
                        label: 'Piutang Overdue',
                        value: highlights.overdueArCount,
                        severity: highlights.overdueArCount > 0 ? 'WARNING' : 'SUCCESS',
                    }}
                />
                <MobileInsightCard
                    insight={{
                        key: 'overdue-ap-count',
                        label: 'Hutang Overdue',
                        value: highlights.overdueApCount,
                        severity: highlights.overdueApCount > 0 ? 'CRITICAL' : 'SUCCESS',
                    }}
                />
                <MobileInsightCard
                    insight={{
                        key: 'draft-journals',
                        label: 'Draft Jurnal',
                        value: highlights.draftJournalCount,
                        severity: highlights.draftJournalCount > 0 ? 'WARNING' : 'INFO',
                    }}
                />
                <MobileInsightCard
                    insight={{
                        key: 'open-recon',
                        label: 'Rekonsiliasi Bank',
                        value: highlights.openReconCount,
                        severity: 'INFO',
                    }}
                />
            </div>
        </div>
    );
}
