import Link from 'next/link';
import { Search, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { formatWibDate } from '@/lib/utils/timezone';
import type { InternalUsageHistory as HistoryData } from '@/types/internal-usage';

export function InternalUsageHistory({ data }: { data: HistoryData }) {
    const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
    const pageHref = (page: number) =>
        `/warehouse/internal-usage?${new URLSearchParams({ query: data.query, department: data.department, page: String(page) })}`;
    const qty = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 4 });
    return (
        <Card>
            <CardHeader>
                <CardTitle>Riwayat pemakaian</CardTitle>
                <CardDescription>
                    Telusuri barang, penerima, dan tujuan penggunaannya.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                <form
                    action="/warehouse/internal-usage"
                    method="get"
                    className="flex flex-wrap items-end gap-3"
                >
                    <div className="min-w-0 flex-1 basis-60 space-y-2">
                        <Label htmlFor="usage-search">
                            Cari barang, penerima, atau nomor bukti
                        </Label>
                        <Input
                            id="usage-search"
                            name="query"
                            defaultValue={data.query}
                            maxLength={100}
                            className="min-h-11"
                            placeholder="Misalnya balpoin…"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="usage-department-filter">Bagian</Label>
                        <Input
                            id="usage-department-filter"
                            name="department"
                            list="usage-departments"
                            defaultValue={data.department}
                            maxLength={100}
                            placeholder="Semua bagian"
                            className="min-h-11"
                        />
                        <datalist id="usage-departments">
                            {data.departments.map((name) => (
                                <option key={name} value={name} />
                            ))}
                        </datalist>
                    </div>
                    <Button
                        className="min-h-11"
                        type="submit"
                        variant="outline"
                    >
                        <Search className="h-4 w-4" />
                        Cari
                    </Button>
                    {(data.query || data.department) && (
                        <Button asChild variant="ghost" className="min-h-11">
                            <Link href="/warehouse/internal-usage">Reset</Link>
                        </Button>
                    )}
                </form>
                {!data.records.length ? (
                    <div className="rounded-lg border border-dashed p-8 text-center">
                        <h2 className="font-semibold">
                            {data.query || data.department
                                ? 'Catatan tidak ditemukan'
                                : 'Belum ada pemakaian internal'}
                        </h2>
                        <p className="mt-2 text-sm text-muted-foreground">
                            {data.query || data.department
                                ? 'Coba kata kunci atau bagian lain.'
                                : 'Pengambilan ATK pertama bisa dicatat melalui Catat pemakaian.'}
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="hidden overflow-hidden rounded-lg border md:block">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Bukti / tanggal</TableHead>
                                        <TableHead>Barang / gudang</TableHead>
                                        <TableHead className="text-right">
                                            Jumlah
                                        </TableHead>
                                        <TableHead>Penerima / bagian</TableHead>
                                        <TableHead>
                                            <span className="sr-only">
                                                Tindakan
                                            </span>
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.records.map((r) => (
                                        <TableRow key={r.id}>
                                            <TableCell>
                                                <p className="font-mono text-xs">
                                                    {r.number}
                                                </p>
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    {formatWibDate(r.createdAt)}
                                                </p>
                                            </TableCell>
                                            <TableCell>
                                                <p className="font-medium">
                                                    {r.productName}
                                                </p>
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    {r.locationName}
                                                </p>
                                            </TableCell>
                                            <TableCell className="text-right font-mono">
                                                {qty.format(r.quantity)}{' '}
                                                {r.unit}
                                            </TableCell>
                                            <TableCell>
                                                <p>{r.recipient}</p>
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    {r.department}
                                                </p>
                                            </TableCell>
                                            <TableCell>
                                                <Button
                                                    asChild
                                                    variant="ghost"
                                                    className="min-h-11"
                                                >
                                                    <Link
                                                        href={`/warehouse/internal-usage/${r.id}`}
                                                        aria-label={`Lihat bukti ${r.number}`}
                                                    >
                                                        Detail
                                                        <ArrowRight className="h-4 w-4" />
                                                    </Link>
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        <div className="space-y-3 md:hidden">
                            {data.records.map((r) => (
                                <article
                                    key={r.id}
                                    className="space-y-3 rounded-lg border p-4"
                                >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <p className="font-mono text-xs">
                                            {r.number}
                                        </p>
                                        <Badge variant="secondary">
                                            Tercatat
                                        </Badge>
                                    </div>
                                    <div className="flex justify-between gap-3">
                                        <div className="min-w-0">
                                            <h2 className="break-words font-semibold">
                                                {r.productName}
                                            </h2>
                                            <p className="text-xs text-muted-foreground">
                                                {r.locationName} ·{' '}
                                                {formatWibDate(r.createdAt)}
                                            </p>
                                        </div>
                                        <strong className="shrink-0 text-sm">
                                            {qty.format(r.quantity)} {r.unit}
                                        </strong>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="min-w-0 break-words text-sm text-muted-foreground">
                                            {r.recipient}
                                            <br />
                                            {r.department}
                                        </p>
                                        <Button
                                            asChild
                                            variant="outline"
                                            className="min-h-11 shrink-0"
                                        >
                                            <Link
                                                href={`/warehouse/internal-usage/${r.id}`}
                                            >
                                                Detail
                                            </Link>
                                        </Button>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                    <p>
                        {data.total} catatan · Halaman {data.page} dari {pages}
                    </p>
                    <div className="flex gap-2">
                        {data.page > 1 && (
                            <Button
                                asChild
                                variant="outline"
                                className="min-h-11"
                            >
                                <Link href={pageHref(data.page - 1)}>
                                    Sebelumnya
                                </Link>
                            </Button>
                        )}
                        {data.page < pages && (
                            <Button
                                asChild
                                variant="outline"
                                className="min-h-11"
                            >
                                <Link href={pageHref(data.page + 1)}>
                                    Berikutnya
                                </Link>
                            </Button>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
