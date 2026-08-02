import { PageHeader } from '@/components/ui/page-header';
import { CommissionReportClient } from './CommissionReportClient';

function startOfMonthISO(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}-01`;
}

function endOfMonthISO(d: Date): string {
    const y = d.getFullYear();
    const m = d.getMonth();
    const last = new Date(y, m + 1, 0);
    const dd = String(last.getDate()).padStart(2, '0');
    const mm = String(last.getMonth() + 1).padStart(2, '0');
    return `${y}-${mm}-${dd}`;
}

export default async function CommissionReportPage({
    searchParams,
}: {
    searchParams?: Promise<{ from?: string; to?: string }>;
}) {
    const params = await searchParams;
    const now = new Date();

    const initialFrom = params?.from ?? startOfMonthISO(now);
    const initialTo = params?.to ?? endOfMonthISO(now);

    return (
        <div className="p-6 space-y-6">
            <PageHeader
                title="Laporan Komisi"
                description="Hitung komisi berjenjang atas % pencapaian target (basis PAID_INVOICE = invoice terbayar). Tier berdasarkan minAchievementPercent, boundary exact inclusive. Sales tanpa target di periode ini: warning NO_TARGET_SET (komisi null, bukan 0). Tidak ada skema aktif: NO_ACTIVE_SCHEME."
            />
            <CommissionReportClient
                initialFrom={initialFrom}
                initialTo={initialTo}
            />
        </div>
    );
}
