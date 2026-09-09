'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { downloadCsv, reportFilename } from '@/lib/utils/csv-export';
import type { StockBalanceData } from '@/types/stock-balance';

const quantity = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 4 });
const headers = [
    'SKU',
    'Barang',
    'Satuan',
    'Saldo Awal',
    'Masuk',
    'Keluar',
    'Saldo Akhir',
];

export function StockBalanceReport({ data }: { data: StockBalanceData }) {
    const [search, setSearch] = useState('');
    const query = search.trim().toLocaleLowerCase('id-ID');
    const rows = data.rows.filter((row) =>
        `${row.skuCode} ${row.name}`.toLocaleLowerCase('id-ID').includes(query),
    );
    const locationName =
        data.locations.find((location) => location.id === data.locationId)
            ?.name ?? 'Semua lokasi';

    const exportCsv = () =>
        downloadCsv(
            reportFilename('Neraca_Stok', `${data.startDate}_${data.endDate}`),
            ['Tanggal Awal', 'Tanggal Akhir', 'Lokasi', ...headers],
            rows.map((row) => [
                data.startDate,
                data.endDate,
                locationName,
                row.skuCode,
                row.name,
                row.unit,
                row.openingStock,
                row.totalIn,
                row.totalOut,
                row.closingStock,
            ]),
        );

    return (
        <div className="space-y-4">
            <form
                key={`${data.startDate}:${data.endDate}:${data.locationId}`}
                action="/warehouse/inventory/balance"
                method="get"
                className="flex flex-wrap items-end gap-3 rounded-lg border p-4"
            >
                <div className="space-y-2">
                    <Label htmlFor="balance-start">Tanggal awal</Label>
                    <Input
                        id="balance-start"
                        name="startDate"
                        type="date"
                        required
                        defaultValue={data.startDate}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="balance-end">Tanggal akhir</Label>
                    <Input
                        id="balance-end"
                        name="endDate"
                        type="date"
                        required
                        defaultValue={data.endDate}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="balance-location">Gudang / lokasi</Label>
                    <select
                        id="balance-location"
                        name="locationId"
                        defaultValue={data.locationId}
                        className="h-9 max-w-full rounded-md border bg-background px-3 text-sm"
                    >
                        <option value="">Semua lokasi</option>
                        {data.locations.map((location) => (
                            <option key={location.id} value={location.id}>
                                {location.name}
                            </option>
                        ))}
                    </select>
                </div>
                <Button type="submit">Tampilkan</Button>
                <Button asChild variant="outline">
                    <Link href="/warehouse/inventory/balance">Reset</Link>
                </Button>
            </form>

            <div className="space-y-1 text-sm text-muted-foreground">
                <p>
                    Periode {data.startDate} s.d. {data.endDate} (WIB) ·{' '}
                    {locationName}
                </p>
                <p>
                    Saldo dihitung dari riwayat mutasi berdasarkan waktu
                    pencatatan, termasuk retur dan penyesuaian. Saldo awal
                    mengikuti kelengkapan mutasi awal stok.
                </p>
                <p>
                    {data.locationId
                        ? 'Transfer antar lokasi dihitung sebagai masuk/keluar pada lokasi yang dipilih.'
                        : 'Semua lokasi termasuk WIP dan stok milik pelanggan. Transfer internal tidak dihitung sebagai masuk/keluar.'}{' '}
                    Jumlah menggunakan satuan utama barang; tidak ada total
                    gabungan antar satuan.
                </p>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="w-full space-y-2 sm:w-80">
                    <Label htmlFor="balance-search">Cari barang / SKU</Label>
                    <Input
                        id="balance-search"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Cari nama atau SKU..."
                    />
                </div>
                <Button
                    variant="outline"
                    onClick={exportCsv}
                    disabled={rows.length === 0}
                >
                    <Download className="mr-2 h-4 w-4" /> Ekspor CSV
                </Button>
            </div>
            <p className="text-sm text-muted-foreground">
                {rows.length} dari {data.rows.length} barang · Ekspor mengikuti
                hasil pencarian.
            </p>
            <div className="rounded-lg border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            {headers.map((header, index) => (
                                <TableHead
                                    key={header}
                                    className={index > 2 ? 'text-right' : ''}
                                >
                                    {header}
                                </TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.length === 0 ? (
                            <TableRow>
                                <TableCell
                                    colSpan={7}
                                    className="h-24 text-center"
                                >
                                    Tidak ada barang yang cocok.
                                </TableCell>
                            </TableRow>
                        ) : (
                            rows.map((row) => (
                                <TableRow key={row.productVariantId}>
                                    <TableCell className="font-mono text-xs">
                                        {row.skuCode}
                                    </TableCell>
                                    <TableCell>{row.name}</TableCell>
                                    <TableCell>{row.unit}</TableCell>
                                    {[
                                        row.openingStock,
                                        row.totalIn,
                                        row.totalOut,
                                        row.closingStock,
                                    ].map((value, index) => (
                                        <TableCell
                                            key={index}
                                            className={`text-right tabular-nums ${value < 0 ? 'text-destructive' : ''}`}
                                        >
                                            {quantity.format(value)}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
