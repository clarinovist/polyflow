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
        <Card className="border-t-4 border-t-violet-500 shadow-sm">
            <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                    <Undo2 className="h-4 w-4" aria-hidden="true" /> Retur
                    Penjualan
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
                {summary ? (
                    <>
                        <p className="text-2xl font-bold tabular-nums">
                            {summary.count}{' '}
                            <span className="text-xs font-normal text-muted-foreground">
                                retur belum selesai
                            </span>
                        </p>
                        <p>
                            {summary.draftCount} draft ·{' '}
                            {summary.confirmedCount} menunggu barang ·{' '}
                            {summary.receivedCount} diterima
                        </p>
                        <p>
                            Nilai dokumen:{' '}
                            {formatRupiah(summary.documentAmount)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            Kondisi terkini, bukan filter periode. Nilai dokumen
                            bukan kredit yang sudah memotong piutang. Retur
                            selesai tetap dapat diperiksa di daftar.
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
                    className="inline-flex min-h-11 items-center font-medium underline underline-offset-4"
                >
                    Lihat retur penjualan
                </Link>
            </CardContent>
        </Card>
    );
}
