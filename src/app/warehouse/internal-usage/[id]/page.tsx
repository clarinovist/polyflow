import Link from 'next/link';
import type { Metadata } from 'next';
import { Button } from '@/components/ui/button';
import { getInternalUsageDetailAction } from '@/actions/inventory/internal-usage';
import { InternalUsageDetail } from '@/components/warehouse/internal-usage/InternalUsageDetail';

export const metadata: Metadata = {
    title: 'Bukti Pemakaian Internal | PolyFlow',
};
export default async function InternalUsageDetailPage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ created?: string }>;
}) {
    const { id } = await params;
    const query = await searchParams;
    const result = await getInternalUsageDetailAction(id);
    return (
        <div className="mx-auto max-w-3xl space-y-6">
            <Button asChild variant="outline" className="min-h-11">
                <Link href="/warehouse/internal-usage">Kembali ke riwayat</Link>
            </Button>
            <h1 className="text-3xl font-bold tracking-tight">
                Bukti pemakaian
            </h1>
            {result.success ? (
                <>
                    {query.created === '1' && (
                        <p
                            role="status"
                            className="rounded-lg border bg-muted/40 p-4"
                        >
                            Pemakaian berhasil dicatat. Stok dan jurnal
                            tersimpan bersama bukti ini.
                        </p>
                    )}
                    <InternalUsageDetail record={result.data} />
                    <Button asChild className="min-h-11">
                        <Link href="/warehouse/internal-usage/create">
                            Catat pemakaian lainnya
                        </Link>
                    </Button>
                </>
            ) : (
                <p
                    role="alert"
                    className="rounded-lg border border-destructive p-4 text-destructive"
                >
                    Bukti tidak dapat dimuat: {result.error}
                </p>
            )}
        </div>
    );
}
