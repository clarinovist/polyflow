import Link from 'next/link';
import type { Metadata } from 'next';
import { getStockBalanceAction } from '@/actions/inventory/stock-balance';
import { StockBalanceReport } from '@/components/warehouse/inventory/StockBalanceReport';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Neraca Stok | PolyFlow' };

export default async function StockBalancePage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const params = await searchParams;
    const single = (value: string | string[] | undefined) =>
        Array.isArray(value) ? value[0] : value;
    const result = await getStockBalanceAction({
        startDate: single(params.startDate),
        endDate: single(params.endDate),
        locationId: single(params.locationId),
    });

    return (
        <div className="mx-auto max-w-[1600px] space-y-6 p-6">
            <Button asChild variant="outline" size="sm">
                <Link href="/warehouse/inventory">Kembali ke Inventaris</Link>
            </Button>
            <div>
                <h1 className="text-2xl font-bold">Neraca Stok</h1>
                <p className="text-muted-foreground">
                    Saldo awal + masuk − keluar = saldo akhir. Jumlah stok tanpa
                    nilai rupiah.
                </p>
            </div>
            {result.success ? (
                <StockBalanceReport data={result.data} />
            ) : (
                <div
                    role="alert"
                    className="space-y-3 rounded-lg border border-destructive p-4"
                >
                    <p>Gagal memuat neraca stok: {result.error}</p>
                    <Button asChild variant="outline">
                        <Link href="/warehouse/inventory/balance">
                            Reset filter dan coba lagi
                        </Link>
                    </Button>
                </div>
            )}
        </div>
    );
}
