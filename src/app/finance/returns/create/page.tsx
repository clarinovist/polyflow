import Link from 'next/link';
import { getFinanceQuickReturnOrders } from '@/actions/finance/sales-returns';
import { QuickSalesReturnForm } from '@/components/finance/returns/QuickSalesReturnForm';
import { PageHeader } from '@/components/ui/page-header';

export const dynamic = 'force-dynamic';
export default async function CreateFinanceReturnPage() {
    const result = await getFinanceQuickReturnOrders();
    return (
        <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
            <Link
                className="inline-flex min-h-11 items-center text-sm underline"
                href="/finance/returns"
            >
                Kembali ke retur
            </Link>
            <PageHeader
                title="Retur & potong tagihan"
                description="Satu kali simpan untuk stok barang jadi dan potongan invoice SO terkait."
            />
            {result.success && result.data ? (
                <QuickSalesReturnForm initialOrders={result.data} />
            ) : (
                <p role="alert">
                    {!result.success
                        ? result.error
                        : 'Daftar SO tidak tersedia. Muat ulang untuk mencoba lagi.'}
                </p>
            )}
        </div>
    );
}
