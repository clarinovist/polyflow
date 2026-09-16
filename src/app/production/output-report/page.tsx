import Link from 'next/link';
import {
    OutputReportFilterError,
    OUTPUT_REPORT_PATH,
    type ReportSearchParams,
} from '@/lib/production/output-report';
import { toBusinessDateString } from '@/lib/utils/timezone';
import { loadOutputReport } from './load-report';
import { ReportView } from './ReportView';

export const dynamic = 'force-dynamic';

export default async function ProductionOutputReportPage({
    searchParams,
}: {
    searchParams: Promise<ReportSearchParams>;
}) {
    let data: Awaited<ReturnType<typeof loadOutputReport>>;
    try {
        data = await loadOutputReport(await searchParams);
    } catch (error) {
        if (!(error instanceof OutputReportFilterError)) throw error;
        return (
            <div className="space-y-3">
                <h1 className="text-3xl font-bold">Rekap Hasil Produksi</h1>
                <p role="alert" className="text-destructive">
                    {error.message}
                </p>
                <Link href={OUTPUT_REPORT_PATH} className="underline">
                    Reset filter laporan
                </Link>
            </div>
        );
    }
    return <ReportView {...data} today={toBusinessDateString(new Date())} />;
}
