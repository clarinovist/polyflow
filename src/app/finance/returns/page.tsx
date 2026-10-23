import Link from 'next/link';
import { ChevronRight, Plus, Search, Undo2 } from 'lucide-react';
import { getFinanceSalesReturnPage } from '@/actions/finance/sales-returns';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { financeReturnStatuses } from '@/components/finance/returns/return-status';
import {
    ReturnBadge,
    ReturnOperationalBadge,
    returnCreditPresentation,
} from '@/components/finance/returns/ReturnStatusBadge';
import {
    type ReturnCreditState,
    returnCreditStateLabel,
} from '@/lib/finance/return-credit-state';
import { cn, formatRupiah } from '@/lib/utils/utils';
import { toBusinessDateString } from '@/lib/utils/timezone';

export const dynamic = 'force-dynamic';

// Keep the mockup's primary filters visible; surface other states when relevant.
const stageOrder: ReturnCreditState[] = [
    'REVIEW',
    'AWAITING_GOODS',
    'POSTED',
    'READY',
    'DRAFT',
    'BALANCE',
    'CANCELLED',
];
const primaryStages = new Set<ReturnCreditState>([
    'REVIEW',
    'AWAITING_GOODS',
    'POSTED',
]);

type Params = {
    page?: string;
    status?: string;
    stage?: string;
    search?: string;
};
export default async function FinanceReturnsPage({
    searchParams,
}: {
    searchParams: Promise<Params>;
}) {
    const params = await searchParams;
    const result = await getFinanceSalesReturnPage({
        page: params.page ?? '1',
        status: params.status || undefined,
        stage: params.stage || undefined,
        search: params.search,
    });
    const pageHref = (page: number, stage = params.stage) => {
        const query = new URLSearchParams({ page: String(page) });
        if (params.status) query.set('status', params.status);
        if (params.search) query.set('search', params.search);
        if (stage) query.set('stage', stage);
        return `/finance/returns?${query}`;
    };
    const data = result.success ? result.data : null;
    const stages = [
        { value: '', label: 'Semua', count: data?.stageCounts?.ALL },
        ...stageOrder
            .filter(
                (value) =>
                    primaryStages.has(value) ||
                    value === params.stage ||
                    (data?.stageCounts?.[value] ?? 0) > 0,
            )
            .map((value) => ({
                value,
                label: returnCreditStateLabel(value),
                count: data?.stageCounts?.[value],
            })),
    ];
    return (
        <div className="min-w-0 space-y-6">
            <nav
                aria-label="Breadcrumb"
                className="flex items-center gap-2 text-sm text-muted-foreground"
            >
                <Link href="/finance" className="hover:text-foreground">
                    Keuangan
                </Link>
                <ChevronRight className="size-3.5" aria-hidden="true" />
                <span aria-current="page" className="text-foreground">
                    Retur
                </span>
            </nav>
            <PageHeader
                title="Retur Penjualan"
                description="Semua tanggal"
                actions={
                    <>
                        <Button variant="outline" className="min-h-11" asChild>
                            <Link href="/finance/returns/credits">
                                Saldo kredit pelanggan
                            </Link>
                        </Button>
                        <Button className="min-h-11" asChild>
                            <Link href="/finance/returns/create">
                                <Plus aria-hidden="true" />
                                Buat retur
                            </Link>
                        </Button>
                    </>
                }
            />
            <div className="space-y-4">
                <nav
                    aria-label="Filter kredit retur"
                    className="flex flex-wrap gap-2"
                >
                    {stages.map(({ value, label, count }) => (
                        <Link
                            key={value}
                            href={pageHref(1, value)}
                            aria-current={
                                (params.stage || '') === value
                                    ? 'page'
                                    : undefined
                            }
                            className={cn(
                                'inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                                (params.stage || '') === value
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : 'bg-card text-muted-foreground hover:bg-accent hover:text-foreground',
                            )}
                        >
                            {label}{' '}
                            {count !== undefined && (
                                <span className="font-semibold tabular-nums">
                                    {count}
                                </span>
                            )}
                        </Link>
                    ))}
                </nav>
                <form
                    action="/finance/returns"
                    className="flex flex-wrap items-center gap-3"
                >
                    {params.stage && (
                        <input
                            type="hidden"
                            name="stage"
                            value={params.stage}
                        />
                    )}
                    <div className="relative w-full sm:min-w-64 sm:flex-1 sm:max-w-sm">
                        <label className="sr-only" htmlFor="return-search">
                            Cari nomor retur, SO, atau customer
                        </label>
                        <Search
                            aria-hidden="true"
                            className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground"
                        />
                        <Input
                            id="return-search"
                            name="search"
                            type="search"
                            defaultValue={params.search}
                            maxLength={100}
                            placeholder="Cari retur, SO, customer"
                            className="h-11 bg-card pl-9"
                        />
                    </div>
                    <label className="sr-only" htmlFor="return-status">
                        Status operasional
                    </label>
                    <select
                        id="return-status"
                        name="status"
                        defaultValue={params.status ?? ''}
                        className="h-11 max-w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"
                    >
                        <option value="">Semua status operasional</option>
                        {Object.entries(financeReturnStatuses).map(
                            ([value, label]) => (
                                <option key={value} value={value}>
                                    {label}
                                </option>
                            ),
                        )}
                    </select>
                    <Button
                        type="submit"
                        variant="outline"
                        className="min-h-11"
                    >
                        Terapkan filter
                    </Button>
                    {(params.search || params.status || params.stage) && (
                        <Button variant="ghost" className="min-h-11" asChild>
                            <Link href="/finance/returns">Reset</Link>
                        </Button>
                    )}
                </form>
            </div>
            {!data ? (
                <div role="alert" className="rounded-xl border p-5 text-sm">
                    Daftar retur tidak dapat dimuat. Periksa izin akses atau
                    filter, lalu coba lagi.{' '}
                    <Link href="/finance/returns" className="underline">
                        Muat ulang daftar
                    </Link>
                </div>
            ) : (
                <>
                    <div className="overflow-hidden rounded-xl border bg-card">
                        <p className="px-4 pt-3 text-xs text-muted-foreground md:hidden">
                            Geser tabel ke samping untuk melihat status dan
                            nilai.
                        </p>
                        <Table
                            aria-label="Daftar retur penjualan"
                            className="min-w-[850px]"
                        >
                            <TableHeader className="bg-muted/40">
                                <TableRow>
                                    <TableHead className="px-5">
                                        Retur
                                    </TableHead>
                                    <TableHead>Customer</TableHead>
                                    <TableHead className="text-right">
                                        Nilai dokumen
                                    </TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="pr-5">
                                        Kredit piutang
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.rows.length === 0 ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={5}
                                            className="h-44 text-center"
                                        >
                                            <Undo2
                                                aria-hidden="true"
                                                className="mx-auto mb-3 size-7 text-muted-foreground"
                                            />
                                            <p className="font-medium">
                                                Tidak ada retur sesuai filter.
                                            </p>
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                Coba kata kunci atau status
                                                lain.
                                            </p>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    data.rows.map((row) => {
                                        const credit =
                                            returnCreditPresentation(row);
                                        return (
                                            <TableRow key={row.id}>
                                                <TableCell className="px-5 py-3">
                                                    <Link
                                                        className="inline-flex min-h-11 items-center font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                                                        href={`/finance/returns/${row.id}`}
                                                    >
                                                        {row.returnNumber}
                                                    </Link>
                                                    <p className="text-xs text-muted-foreground">
                                                        {toBusinessDateString(
                                                            new Date(
                                                                row.returnDate,
                                                            ),
                                                        )}
                                                    </p>
                                                </TableCell>
                                                <TableCell className="max-w-64 whitespace-normal py-4">
                                                    <p className="font-medium">
                                                        {row.customer?.name ??
                                                            'Tanpa customer'}
                                                    </p>
                                                    <p className="mt-1 text-xs text-muted-foreground">
                                                        {
                                                            row.salesOrder
                                                                .orderNumber
                                                        }
                                                    </p>
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums">
                                                    {formatRupiah(
                                                        row.totalAmount,
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <ReturnOperationalBadge
                                                        status={row.status}
                                                    />
                                                </TableCell>
                                                <TableCell className="max-w-72 whitespace-normal py-4 pr-5">
                                                    <ReturnBadge
                                                        label={credit.label}
                                                        tone={credit.tone}
                                                    />
                                                    <p className="mt-1.5 text-xs text-muted-foreground">
                                                        {!row.customerCredit &&
                                                        (row.credit
                                                            ?.recoveryActive ||
                                                            row.credit
                                                                ?.status ===
                                                                'POSTED')
                                                            ? `${formatRupiah(row.credit.totalAmount)} · bukan pembayaran`
                                                            : row.credit
                                                                  ?.reviewReason ||
                                                              credit.description}
                                                    </p>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
                        <p>
                            {data.total} retur · Semua tanggal, tidak mengikuti
                            filter periode Papan Keuangan.
                        </p>
                        <nav
                            aria-label="Halaman retur"
                            className="flex flex-wrap items-center gap-3"
                        >
                            {data.page > 1 && (
                                <Button variant="outline" asChild>
                                    <Link href={pageHref(data.page - 1)}>
                                        Sebelumnya
                                    </Link>
                                </Button>
                            )}
                            <span>
                                Halaman {data.page} dari {data.totalPages}
                            </span>
                            {data.page < data.totalPages && (
                                <Button variant="outline" asChild>
                                    <Link href={pageHref(data.page + 1)}>
                                        Berikutnya
                                    </Link>
                                </Button>
                            )}
                        </nav>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Nilai dokumen bukan kredit terposting. Status selesai
                        secara operasional tidak otomatis mengurangi piutang.
                    </p>
                </>
            )}
        </div>
    );
}
