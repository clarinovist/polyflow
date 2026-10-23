import Link from 'next/link';
import { Plus, Info } from 'lucide-react';
import type { Metadata } from 'next';
import { Button } from '@/components/ui/button';
import { InternalUsageHistory } from '@/components/warehouse/internal-usage/InternalUsageHistory';
import { getInternalUsageHistoryAction } from '@/actions/inventory/internal-usage';

export const metadata: Metadata = { title: 'Pemakaian Internal | PolyFlow' };
export default async function InternalUsagePage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const params = await searchParams;
    const single = (value: string | string[] | undefined) =>
        Array.isArray(value) ? value[0] : value;
    const result = await getInternalUsageHistoryAction({
        query: single(params.query),
        department: single(params.department),
        page: single(params.page),
    });
    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        Pemakaian Internal
                    </h1>
                    <p className="mt-2 text-muted-foreground">
                        Catat ATK dan barang operasional yang digunakan untuk
                        kebutuhan kantor, bukan produksi.
                    </p>
                </div>
                {result.success && (
                    <Button asChild className="min-h-11">
                        <Link href="/warehouse/internal-usage/create">
                            <Plus className="h-4 w-4" />
                            Catat pemakaian
                        </Link>
                    </Button>
                )}
            </div>
            <div className="flex gap-3 rounded-lg border bg-muted/40 p-4 text-sm">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                    ATK dipakai? Catat di sini tanpa SPK. Jika barang hanya
                    berpindah tempat dan masih menjadi stok, gunakan Transfer.
                </p>
            </div>
            {result.success ? (
                <InternalUsageHistory data={result.data} />
            ) : (
                <p
                    role="alert"
                    className="rounded-lg border border-destructive p-4 text-destructive"
                >
                    Gagal memuat pemakaian internal: {result.error}
                </p>
            )}
        </div>
    );
}
