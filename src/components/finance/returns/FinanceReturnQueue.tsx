import Link from 'next/link';
import { Undo2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatRupiah } from '@/lib/utils/utils';
import type { FinanceReturnSummary } from '@/services/finance/sales-return-query-service';

export function FinanceReturnQueue({
    summary,
}: {
    summary: FinanceReturnSummary | null;
}) {
    return (
        <Card className="gap-2 border-t-4 border-t-violet-500 py-4 shadow-sm">
            <CardHeader className="px-4 pb-0">
                <CardTitle className="flex items-center gap-2 text-sm">
                    <Undo2 className="h-4 w-4" aria-hidden="true" /> Retur
                    Penjualan
                </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 px-4 text-sm md:grid-cols-[1fr_auto] [overflow-wrap:anywhere]">
                {summary ? (
                    <>
                        <p className="text-2xl font-bold tabular-nums">
                            {summary.count}{' '}
                            <span className="text-xs font-normal text-muted-foreground">
                                retur menunggu tindak lanjut
                            </span>
                        </p>
                        <p>
                            {summary.draftCount} draft ·{' '}
                            {summary.confirmedCount} menunggu barang ·{' '}
                            {summary.receivedCount} menunggu Finance
                        </p>
                        <p className="tabular-nums md:col-start-2 md:row-start-1 md:text-right">
                            Nilai dokumen:{' '}
                            {formatRupiah(summary.documentAmount)}
                        </p>
                        <p className="text-xs text-muted-foreground md:col-span-2">
                            Kondisi terkini, bukan filter periode. Nilai dokumen
                            bukan kredit yang sudah memotong piutang. Retur
                            selesai secara operasional tetap dalam antrean
                            sampai kredit terposting.
                        </p>
                    </>
                ) : (
                    <p role="alert">
                        Antrean retur tidak tersedia. Akses mungkin dibatasi
                        atau data gagal dimuat; jangan menganggap antrean
                        kosong.
                    </p>
                )}
                <Link
                    href="/finance/returns"
                    className="inline-flex min-h-11 items-center font-medium underline underline-offset-4 md:col-span-2"
                >
                    Lihat retur penjualan
                </Link>
            </CardContent>
        </Card>
    );
}
