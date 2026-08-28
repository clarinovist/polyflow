import { withTenantPage } from '@/lib/core/tenant';
import { requireFinanceAccess } from '@/lib/auth/finance-access';
import { toBusinessDateString } from '@/lib/utils/timezone';
import { RekapDagangService } from '@/services/finance/rekap-dagang-service';
import { RecapReportView } from '@/components/finance/reports/recap-report-view';
import { RecapDateFilter } from '@/components/finance/reports/recap-date-filter';

export const dynamic = 'force-dynamic';

const getReport = withTenantPage(async (from: string, to: string) => {
    await requireFinanceAccess();
    return RekapDagangService.getPiutangKaryawanRecap({ from, to });
});

interface PageProps {
    searchParams: Promise<{ from?: string; to?: string }>;
}

export default async function RekapPiutangKaryawanPage({
    searchParams,
}: PageProps) {
    const params = await searchParams;
    const now = new Date();
    const from =
        params.from ||
        toBusinessDateString(new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000));
    const to = params.to || toBusinessDateString(now);

    const result = await getReport(from, to);

    return (
        <RecapReportView
            title="Rekap Piutang Karyawan"
            description="Mutasi masuk (kasbon baru), mutasi keluar (angsuran/potongan gaji), dan saldo per karyawan."
            partnerLabel="Karyawan"
            inLabel="Mutasi Masuk"
            outLabel="Mutasi Keluar"
            result={result}
            filter={
                <RecapDateFilter
                    basePath="/finance/rekap-piutang-karyawan"
                    from={from}
                    to={to}
                />
            }
        />
    );
}
