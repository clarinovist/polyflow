import Link from 'next/link';
import type { Metadata } from 'next';
import { listStockLedgerGaps } from '@/actions/inventory/stock-ledger-gaps';
import { StockLedgerGaps } from '@/components/warehouse/inventory/StockLedgerGaps';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
    title: 'Selisih Kartu Stok | PolyFlow',
};

export default async function StockLedgerGapsPage() {
    const result = await listStockLedgerGaps();

    return (
        <div className="mx-auto max-w-[1600px] space-y-6 p-6">
            <Button asChild variant="outline" size="sm">
                <Link href="/warehouse/inventory">Kembali ke Inventaris</Link>
            </Button>
            <div>
                <h1 className="text-2xl font-bold">Selisih Kartu Stok</h1>
                <p className="text-muted-foreground">
                    Perbandingan saldo stok berjalan terhadap kartu stok
                    (seluruh mutasi masuk dikurangi keluar per varian dan
                    lokasi).
                </p>
            </div>
            {result.success && result.data ? (
                <StockLedgerGaps health={result.data} />
            ) : (
                <div
                    role="alert"
                    className="space-y-3 rounded-lg border border-destructive p-4"
                >
                    <p>
                        Gagal memuat selisih kartu stok:{' '}
                        {!result.success ? result.error : 'Data tidak tersedia'}
                    </p>
                </div>
            )}
        </div>
    );
}
