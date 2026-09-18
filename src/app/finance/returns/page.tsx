import Link from 'next/link';
import { getFinanceSalesReturnPage } from '@/actions/finance/sales-returns';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    financeReturnGuidance,
    financeReturnStatuses,
} from '@/components/finance/returns/return-status';
import { formatRupiah } from '@/lib/utils/utils';
import { toBusinessDateString } from '@/lib/utils/timezone';

export const dynamic = 'force-dynamic';

type Params = { page?: string; status?: string; search?: string };
export default async function FinanceReturnsPage({
    searchParams,
}: {
    searchParams: Promise<Params>;
}) {
    const params = await searchParams;
    const result = await getFinanceSalesReturnPage({
        page: params.page ?? '1',
        status: params.status || undefined,
        search: params.search,
    });
    const pageHref = (page: number) => {
        const query = new URLSearchParams({ page: String(page) });
        if (params.status) query.set('status', params.status);
        if (params.search) query.set('search', params.search);
        return `/finance/returns?${query}`;
    };
    return (
        <div className="space-y-6">
            <PageHeader
                title="Retur Penjualan"
                description="Pantau retur dari Penjualan. Daftar ini tidak menerapkan potongan invoice; draft belum mengurangi piutang."
            />
            <form
                action="/finance/returns"
                className="flex flex-wrap items-end gap-3"
            >
                <label className="space-y-1 text-sm" htmlFor="return-search">
                    Cari nomor retur, SO, atau customer
                    <Input
                        id="return-search"
                        name="search"
                        defaultValue={params.search}
                        maxLength={100}
                        className="w-full sm:w-72"
                    />
                </label>
                <label className="space-y-1 text-sm" htmlFor="return-status">
                    Status operasional
                    <select
                        id="return-status"
                        name="status"
                        defaultValue={params.status ?? ''}
                        className="flex h-10 w-full rounded-md border bg-background px-3 text-sm"
                    >
                        <option value="">Semua status</option>
                        {Object.entries(financeReturnStatuses).map(
                            ([value, label]) => (
                                <option key={value} value={value}>
                                    {label}
                                </option>
                            ),
                        )}
                    </select>
                </label>
                <Button type="submit">Terapkan filter</Button>
                <Button variant="outline" asChild>
                    <Link href="/finance/returns">Reset</Link>
                </Button>
            </form>
            {!result.success || !result.data ? (
                <div role="alert" className="rounded-md border p-4">
                    Daftar retur tidak dapat dimuat. Periksa izin akses atau
                    filter, lalu coba lagi.{' '}
                    <Link href="/finance/returns" className="underline">
                        Muat ulang daftar
                    </Link>
                </div>
            ) : (
                <>
                    <p className="text-sm text-muted-foreground">
                        {result.data.total} retur · Semua tanggal, tidak
                        mengikuti filter periode Papan Keuangan.
                    </p>
                    <p className="text-xs text-muted-foreground md:hidden">
                        Geser tabel ke samping untuk melihat status, nilai, dan
                        tindak lanjut.
                    </p>
                    <div className="overflow-x-auto rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>No. Retur / SO</TableHead>
                                    <TableHead>Customer</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">
                                        Nilai dokumen
                                    </TableHead>
                                    <TableHead>Tindak lanjut</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {result.data.rows.length === 0 ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={5}
                                            className="py-8 text-center"
                                        >
                                            Tidak ada retur sesuai filter.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    result.data.rows.map((row) => (
                                        <TableRow key={row.id}>
                                            <TableCell>
                                                <Link
                                                    className="inline-flex min-h-11 items-center font-medium underline underline-offset-4"
                                                    href={`/finance/returns/${row.id}`}
                                                >
                                                    {row.returnNumber}
                                                </Link>
                                                <p className="text-xs text-muted-foreground">
                                                    {toBusinessDateString(
                                                        new Date(
                                                            row.returnDate,
                                                        ),
                                                    )}{' '}
                                                    ·{' '}
                                                    {row.salesOrder.orderNumber}
                                                </p>
                                            </TableCell>
                                            <TableCell>
                                                {row.customer?.name ??
                                                    'Tanpa customer'}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="secondary">
                                                    {
                                                        financeReturnStatuses[
                                                            row.status
                                                        ]
                                                    }
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {formatRupiah(row.totalAmount)}
                                            </TableCell>
                                            <TableCell className="min-w-60 max-w-sm whitespace-normal text-xs">
                                                {financeReturnGuidance(
                                                    row.status,
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                    <nav
                        aria-label="Halaman retur"
                        className="flex flex-wrap items-center gap-3"
                    >
                        {result.data.page > 1 && (
                            <Button variant="outline" asChild>
                                <Link href={pageHref(result.data.page - 1)}>
                                    Sebelumnya
                                </Link>
                            </Button>
                        )}
                        <span className="text-sm">
                            Halaman {result.data.page} dari{' '}
                            {result.data.totalPages}
                        </span>
                        {result.data.page < result.data.totalPages && (
                            <Button variant="outline" asChild>
                                <Link href={pageHref(result.data.page + 1)}>
                                    Berikutnya
                                </Link>
                            </Button>
                        )}
                    </nav>
                </>
            )}
        </div>
    );
}
