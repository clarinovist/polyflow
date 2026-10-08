import { getFinanceMobileOverview } from '@/actions/finance/mobile-dashboard';
import {
    MobileDataFreshness,
    MobileInsightCard,
    MobileSectionHeader,
} from '@/components/mobile';
import { MobileReadError } from '@/components/mobile/MobileReadError';
export default async function FinanceInsightsPage() {
    const response = await getFinanceMobileOverview();
    if (!response.success)
        return <MobileReadError title="Insight finance belum tersedia" />;
    const { highlights, generatedAt } = response.data;
    return (
        <div className="space-y-6">
            <MobileSectionHeader title="Finance Insights" level={1} />
            <MobileDataFreshness generatedAt={generatedAt} />
            <div className="grid grid-cols-1 gap-3">
                {'arAmount' in highlights && (
                    <MobileInsightCard
                        insight={{
                            key: 'ar-amount',
                            label: 'Total AR Terbuka',
                            value: highlights.arAmount!.toLocaleString('id-ID'),
                            unit: 'IDR',
                            severity: highlights.arAmount
                                ? 'WARNING'
                                : 'SUCCESS',
                        }}
                    />
                )}
                {'apAmount' in highlights && (
                    <MobileInsightCard
                        insight={{
                            key: 'ap-amount',
                            label: 'Total AP Terbuka',
                            value: highlights.apAmount!.toLocaleString('id-ID'),
                            unit: 'IDR',
                            severity: highlights.apAmount
                                ? 'CRITICAL'
                                : 'SUCCESS',
                        }}
                    />
                )}
                <MobileInsightCard
                    insight={{
                        key: 'draft-journals-count',
                        label: 'Draft Jurnal Pending',
                        value: highlights.draftJournalCount,
                        unit: 'jurnal',
                        severity: highlights.draftJournalCount
                            ? 'WARNING'
                            : 'INFO',
                    }}
                />
            </div>
            {!('arAmount' in highlights) && (
                <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
                    Nominal tidak dikirim karena izin harga tidak tersedia.
                </p>
            )}
        </div>
    );
}
