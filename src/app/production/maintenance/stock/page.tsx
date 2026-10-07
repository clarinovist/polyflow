import Link from 'next/link';
import { ArrowLeft, Boxes, PackagePlus } from 'lucide-react';
import {
    getOperationalVariants,
    getSparePartStock,
} from '@/actions/inventory/sparepart-stock';
import { MobileReadError } from '@/components/mobile/MobileReadError';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { SparePartStockInForm } from './stock-in-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Stok Spare Part | PolyFlow' };

const rupiah = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
});

export default async function SparePartStockPage() {
    const [stock, variants] = await Promise.all([
        getSparePartStock(),
        getOperationalVariants(),
    ]);
    if (!stock.success || !variants.success) {
        return <MobileReadError title="Stok spare part belum tersedia" />;
    }

    return (
        <div className="mx-auto max-w-[1400px] space-y-6 py-2">
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <Button asChild variant="link" className="h-auto p-0 text-muted-foreground">
                        <Link href="/production/maintenance">
                            <ArrowLeft className="h-4 w-4" /> Kembali ke Maintenance
                        </Link>
                    </Button>
                    <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Produksi / Maintenance
                    </p>
                    <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">
                        Stok Spare Part
                    </h1>
                    <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                        Catat stok masuk dan pantau ketersediaan part operasional untuk pekerjaan maintenance.
                    </p>
                </div>
                <div className="rounded-xl border bg-card px-4 py-3 text-right shadow-sm">
                    <p className="text-xs text-muted-foreground">Kombinasi stok tersedia</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums">
                        {stock.data.rows.length}
                    </p>
                </div>
            </header>

            <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
                <Card className="h-fit">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <PackagePlus className="h-4 w-4 text-emerald-700" />
                            Catat stok masuk
                        </CardTitle>
                        <CardDescription>
                            Pembelian atau stok awal akan tercatat bersama jurnal otomatis.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <SparePartStockInForm
                            locations={stock.data.locations}
                            variants={variants.data}
                        />
                    </CardContent>
                </Card>

                <Card className="min-w-0 overflow-hidden">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Boxes className="h-4 w-4 text-emerald-700" />
                            Ketersediaan per lokasi
                        </CardTitle>
                        <CardDescription>
                            Part terhubung akan berkurang saat pekerjaan ditandai selesai.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="px-0">
                        {stock.data.rows.length ? (
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/40">
                                        <TableHead className="pl-6">Part</TableHead>
                                        <TableHead>Lokasi</TableHead>
                                        <TableHead className="text-right">Qty</TableHead>
                                        <TableHead className="pr-6 text-right">Rata-rata</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {stock.data.rows.map((row: {
                                        productVariant: { id: string; name: string };
                                        location: { id: string; name: string };
                                        quantity: unknown;
                                        averageCost: unknown;
                                    }) => (
                                        <TableRow key={row.productVariant.id + row.location.id}>
                                            <TableCell className="pl-6 font-medium">
                                                {row.productVariant.name}
                                            </TableCell>
                                            <TableCell>{row.location.name}</TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {Number(row.quantity).toLocaleString('id-ID')}
                                            </TableCell>
                                            <TableCell className="pr-6 text-right tabular-nums">
                                                {row.averageCost
                                                    ? rupiah.format(Number(row.averageCost))
                                                    : '—'}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        ) : (
                            <div className="px-6 py-16 text-center">
                                <Boxes className="mx-auto h-8 w-8 text-muted-foreground" />
                                <p className="mt-3 font-medium">Belum ada stok spare part</p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Gunakan formulir di samping untuk mencatat stok awal.
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
