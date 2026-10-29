'use client';

import { useState } from 'react';
import { getStockLedgerGapHistory } from '@/actions/inventory/stock-ledger-gaps';
import type {
    StockLedgerHealth,
    StockLedgerMismatch,
    StockLedgerPairHistory,
} from '@/services/inventory/stock-ledger-health-service';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';

const ROUNDING_THRESHOLD = 0.01;

function formatSigned(value: string): string {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0 && !value.startsWith('+')) {
        return `+${value}`;
    }
    return value;
}

function classifyDiff(diff: string): 'pembulatan' | 'material' {
    return Math.abs(Number(diff)) < ROUNDING_THRESHOLD
        ? 'pembulatan'
        : 'material';
}

function formatDateTime(iso: string): string {
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return iso;
    return parsed.toISOString().replace('T', ' ').slice(0, 19);
}

export function StockLedgerGaps({ health }: { health: StockLedgerHealth }) {
    const [selectedPair, setSelectedPair] =
        useState<StockLedgerMismatch | null>(null);
    const [history, setHistory] = useState<StockLedgerPairHistory | null>(null);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [historyError, setHistoryError] = useState<string | null>(null);

    const handleSelectPair = async (item: StockLedgerMismatch) => {
        setSelectedPair(item);
        setLoadingHistory(true);
        setHistoryError(null);
        setHistory(null);

        const res = await getStockLedgerGapHistory({
            productVariantId: item.productVariantId,
            locationId: item.locationId,
        });
        setLoadingHistory(false);
        if (res.success && res.data) {
            setHistory(res.data);
        } else {
            setHistoryError(
                !res.success ? res.error : 'Gagal memuat riwayat pasangan',
            );
        }
    };

    const firstNegative =
        history?.firstNegative ??
        history?.movements.find((m) => Number(m.runningBalance) < 0) ??
        null;

    return (
        <div className="space-y-6">
            <div className="rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">
                    Halaman ini hanya untuk diagnosis (baca-saja).
                </p>
                <p>
                    Residu pembulatan (|selisih| &lt; 0,01) akan diselaraskan
                    lewat koreksi terjaga; selisih material memerlukan
                    pemeriksaan admin/Finance. Tidak ada tombol koreksi pada
                    halaman ini.
                </p>
            </div>

            <div
                aria-label="Ringkasan selisih"
                className="grid grid-cols-1 gap-4 sm:grid-cols-3"
            >
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Total Pasangan Berselisih
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold tabular-nums">
                            {health.findings}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Residu Pembulatan (&lt; 0,01)
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold tabular-nums">
                            {health.roundingCount}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Selisih Material (&ge; 0,01)
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold tabular-nums text-destructive">
                            {health.materialCount}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {health.mismatches.length === 0 ? (
                <div className="rounded-lg border p-8 text-center text-muted-foreground">
                    Semua saldo cocok dengan kartu stok
                </div>
            ) : (
                <div
                    className="rounded-lg border overflow-x-auto"
                    role="region"
                    aria-label="Daftar selisih kartu stok"
                >
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>SKU</TableHead>
                                <TableHead>Lokasi</TableHead>
                                <TableHead className="text-right">
                                    Saldo Berjalan
                                </TableHead>
                                <TableHead className="text-right">
                                    Kartu Stok
                                </TableHead>
                                <TableHead className="text-right">
                                    Selisih
                                </TableHead>
                                <TableHead>Jenis</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {health.mismatches.map((item) => {
                                const kind = classifyDiff(item.diff);
                                const isSelected =
                                    selectedPair?.productVariantId ===
                                        item.productVariantId &&
                                    selectedPair?.locationId ===
                                        item.locationId;
                                return (
                                    <TableRow
                                        key={`${item.productVariantId}:${item.locationId}`}
                                        onClick={() =>
                                            void handleSelectPair(item)
                                        }
                                        className={`cursor-pointer hover:bg-muted/40 ${isSelected ? 'bg-muted/30' : ''}`}
                                    >
                                        <TableCell className="font-mono text-xs font-medium">
                                            {item.skuCode}
                                        </TableCell>
                                        <TableCell>
                                            {item.locationName}
                                        </TableCell>
                                        <TableCell className="text-right font-mono tabular-nums">
                                            {item.live}
                                        </TableCell>
                                        <TableCell className="text-right font-mono tabular-nums">
                                            {item.ledger}
                                        </TableCell>
                                        <TableCell className="text-right font-mono tabular-nums font-semibold">
                                            {formatSigned(item.diff)}
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant={
                                                    kind === 'material'
                                                        ? 'destructive'
                                                        : 'secondary'
                                                }
                                            >
                                                {kind}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            )}

            {loadingHistory && (
                <p className="text-sm text-muted-foreground">
                    Memuat riwayat mutasi...
                </p>
            )}

            {historyError && (
                <div
                    role="alert"
                    className="rounded-lg border border-destructive p-4 text-sm text-destructive"
                >
                    {historyError}
                </div>
            )}

            {selectedPair && history && (
                <Card aria-label="Riwayat mutasi pasangan">
                    <CardHeader className="space-y-1">
                        <CardTitle className="text-base">
                            Riwayat Kartu Stok: {selectedPair.skuCode} —{' '}
                            {selectedPair.locationName}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">
                            Saldo berjalan: {history.live} · Kartu stok:{' '}
                            {history.ledger} · Selisih:{' '}
                            {formatSigned(history.diff)}
                            {history.truncated
                                ? ` · Menampilkan ${history.movements.length} dari ${history.totalMovements} mutasi terbaru (Saldo sebelum jendela: ${history.openingBalance})`
                                : ''}
                        </p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {firstNegative && (
                            <div className="rounded-md border border-amber-300 bg-amber-50/40 p-3 text-sm">
                                <p className="font-medium">
                                    Pertama kali kartu stok negatif:{' '}
                                    <span className="font-mono">
                                        {firstNegative.runningBalance}
                                    </span>
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {formatDateTime(firstNegative.createdAt)} ·{' '}
                                    {firstNegative.type} · Referensi:{' '}
                                    {firstNegative.reference || '-'}
                                </p>
                            </div>
                        )}

                        <div className="rounded-md border overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Tanggal</TableHead>
                                        <TableHead>Jenis</TableHead>
                                        <TableHead>Referensi</TableHead>
                                        <TableHead className="text-right">
                                            Masuk
                                        </TableHead>
                                        <TableHead className="text-right">
                                            Keluar
                                        </TableHead>
                                        <TableHead className="text-right">
                                            Saldo Kartu Stok Berjalan
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {history.movements.length === 0 ? (
                                        <TableRow>
                                            <TableCell
                                                colSpan={6}
                                                className="h-20 text-center text-muted-foreground"
                                            >
                                                Tidak ada mutasi untuk pasangan
                                                ini.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        history.movements.map((mov) => (
                                            <TableRow key={mov.id}>
                                                <TableCell className="font-mono text-xs whitespace-nowrap">
                                                    {formatDateTime(
                                                        mov.createdAt,
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline">
                                                        {mov.type}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="font-mono text-xs">
                                                    {mov.reference || '-'}
                                                </TableCell>
                                                <TableCell className="text-right font-mono tabular-nums">
                                                    {Number(mov.inQuantity) > 0
                                                        ? mov.inQuantity
                                                        : '-'}
                                                </TableCell>
                                                <TableCell className="text-right font-mono tabular-nums">
                                                    {Number(mov.outQuantity) > 0
                                                        ? mov.outQuantity
                                                        : '-'}
                                                </TableCell>
                                                <TableCell
                                                    className={`text-right font-mono tabular-nums font-semibold ${Number(mov.runningBalance) < 0 ? 'text-destructive' : ''}`}
                                                >
                                                    {mov.runningBalance}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
