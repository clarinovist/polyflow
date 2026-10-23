import Link from 'next/link';
import type { Metadata } from 'next';
import { Button } from '@/components/ui/button';
import { getInternalUsageFormAction } from '@/actions/inventory/internal-usage';
import { InternalUsageForm } from '@/components/warehouse/internal-usage/InternalUsageForm';

export const metadata: Metadata = {
    title: 'Catat Pemakaian Internal | PolyFlow',
};
export default async function CreateInternalUsagePage() {
    const result = await getInternalUsageFormAction();
    return (
        <div className="space-y-6">
            <Button asChild variant="outline" className="min-h-11">
                <Link href="/warehouse/internal-usage">Kembali ke riwayat</Link>
            </Button>
            <div>
                <h1 className="text-3xl font-bold tracking-tight">
                    Catat pemakaian
                </h1>
                <p className="mt-2 text-muted-foreground">
                    Untuk ATK dan Barang Operasional yang digunakan sendiri.
                </p>
            </div>
            {result.success ? (
                <InternalUsageForm data={result.data} />
            ) : (
                <p
                    role="alert"
                    className="rounded-lg border border-destructive p-4 text-destructive"
                >
                    Gagal memuat formulir: {result.error}
                </p>
            )}
        </div>
    );
}
