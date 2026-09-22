import Link from 'next/link';
import { getFinanceCustomerCredits } from '@/actions/finance/sales-returns';
import { formatRupiah } from '@/lib/utils/utils';
export const dynamic = 'force-dynamic';
export default async function CustomerCreditsPage({
    searchParams,
}: {
    searchParams: Promise<{ page?: string; search?: string }>;
}) {
    const query = await searchParams;
    const result = await getFinanceCustomerCredits(query);
    if (!result.success)
        return (
            <p role="alert">
                Saldo kredit tidak dapat dimuat. Periksa akses atau coba lagi.
            </p>
        );
    const { rows, page, pages } = result.data;
    return (
        <div className="space-y-4">
            <Link
                href="/finance/returns"
                className="inline-flex min-h-11 items-center underline"
            >
                Retur penjualan
            </Link>
            <h1 className="text-2xl font-semibold">Saldo kredit pelanggan</h1>
            <p>
                Kewajiban dari retur invoice lunas. Pemakaian mengurangi
                tagihan, bukan penerimaan kas.
            </p>
            <form className="flex gap-2">
                <input
                    name="search"
                    aria-label="Cari customer atau nomor retur"
                    defaultValue={query.search}
                    className="min-h-11 flex-1 rounded border px-3"
                    placeholder="Customer / nomor retur"
                />
                <button className="min-h-11 rounded border px-4">Cari</button>
            </form>
            {rows.length === 0 ? (
                <p>
                    Belum ada saldo kredit. Terbitkan dari detail retur invoice
                    lunas yang sudah diterima.
                </p>
            ) : (
                <div className="space-y-3">
                    {rows.map((n) => (
                        <Link
                            key={n.id}
                            href={`/finance/returns/credits/${n.id}`}
                            className="block space-y-1 rounded border p-4"
                        >
                            <p className="font-semibold">
                                {n.customer} · {n.returnNumber}
                            </p>
                            <p>
                                {n.status === 'POSTED' ? 'Aktif' : 'Dibalik'} ·
                                Nilai {formatRupiah(Number(n.total))}
                            </p>
                            <p>
                                Sisa kredit{' '}
                                <strong>
                                    {formatRupiah(Number(n.remaining))}
                                </strong>
                            </p>
                        </Link>
                    ))}
                </div>
            )}
            <div className="flex items-center gap-4">
                {page > 1 && (
                    <Link
                        className="min-h-11 py-3 underline"
                        href={`?page=${page - 1}&search=${encodeURIComponent(query.search ?? '')}`}
                    >
                        Sebelumnya
                    </Link>
                )}
                <span>
                    Halaman {page} / {pages}
                </span>
                {page < pages && (
                    <Link
                        className="min-h-11 py-3 underline"
                        href={`?page=${page + 1}&search=${encodeURIComponent(query.search ?? '')}`}
                    >
                        Berikutnya
                    </Link>
                )}
            </div>
        </div>
    );
}
