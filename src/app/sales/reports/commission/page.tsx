import { SalesMetricInfo } from '@/components/sales/SalesMetricInfo';
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
            <div>
                <div className="flex items-center gap-1">
                    <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
                        Laporan Komisi
                    </h1>
                    <SalesMetricInfo label="Info basis komisi">
                        Basis komisi adalah invoice terbayar (PAID_INVOICE).
                        Persentase pencapaian target menentukan tier komisi.
                        Lihat Cara perhitungan untuk aturan lengkap.
                    </SalesMetricInfo>
                </div>
                <p className="mt-1 text-sm text-muted-foreground md:text-base">
                    Komisi berjenjang berdasarkan pencapaian target.
                </p>
            </div>
            <details className="rounded-lg border bg-muted/30 px-4">
                <summary className="min-h-11 cursor-pointer content-center rounded-sm text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">
                    Cara perhitungan
                </summary>
                <ul className="list-disc space-y-2 pb-4 pl-5 text-sm text-muted-foreground">
                    <li>
                        Basis PAID_INVOICE menggunakan invoice terbayar, bukan
                        seluruh nilai pesanan.
                    </li>
                    <li>
                        Tier mengikuti batas minimum persentase pencapaian
                        target (minAchievementPercent). Nilai tepat pada batas
                        sudah masuk tier tersebut.
                    </li>
                    <li>
                        Tanpa target pada periode ini (NO_TARGET_SET), komisi
                        belum dapat dihitung: nilainya kosong, bukan nol.
                    </li>
                    <li>
                        Tanpa skema aktif (NO_ACTIVE_SCHEME), peringatan tetap
                        ditampilkan pada hasil perhitungan.
                    </li>
                </ul>
            </details>
            <CommissionReportClient
                initialFrom={initialFrom}
                initialTo={initialTo}
            />
        </div>
    );
}
