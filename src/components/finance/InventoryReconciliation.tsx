'use client';

import { useRef, useState, useTransition } from 'react';
import {
    listInventoryReconciliation,
    inspectInventoryReconciliationAction,
} from '@/actions/finance/inventory-reconciliation';
import type {
    InventoryReconciliationDiagnosis,
    ReconciliationCatalog,
} from '@/types/inventory-reconciliation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InventoryReconciliationDetail } from './InventoryReconciliationDetail';
import { AtkCostRecovery } from './AtkCostRecovery';
import { AtkPendingRecovery } from './AtkPendingRecovery';
import { usePendingAtkRecovery } from './atk-recovery-pending';

export function InventoryReconciliation({ recoveryScope }: { recoveryScope: string }) {
    const recovery = usePendingAtkRecovery(recoveryScope);
    const [query, setQuery] = useState('');
    const [searchedQuery, setSearchedQuery] = useState('');
    const [catalog, setCatalog] = useState<ReconciliationCatalog | null>(null);
    const [diagnosis, setDiagnosis] =
        useState<InventoryReconciliationDiagnosis | null>(null);
    const [error, setError] = useState('');
    const [pending, startTransition] = useTransition();
    const request = useRef(0);
    const blocked = pending || recovery.blocked;

    function search(page: number, searchQuery = query) {
        if (blocked) return;
        const current = ++request.current;
        setDiagnosis(null);
        setError('');
        setCatalog(null);
        startTransition(async () => {
            try {
                const result = await listInventoryReconciliation({
                    query: searchQuery,
                    page,
                });
                if (current !== request.current) return;
                if (result.success) {
                    setCatalog(result.data);
                    setSearchedQuery(searchQuery);
                } else setError(result.error);
            } catch {
                if (current === request.current)
                    setError(
                        'Pemeriksaan belum berhasil. Coba lagi; tidak ada perubahan data.',
                    );
            }
        });
    }
    function inspect(variantId: string) {
        if (blocked) return;
        const current = ++request.current;
        setDiagnosis(null);
        setError('');
        startTransition(async () => {
            try {
                const result = await inspectInventoryReconciliationAction({
                    variantId,
                });
                if (current !== request.current) return;
                if (result.success) setDiagnosis(result.data);
                else setError(result.error);
            } catch {
                if (current === request.current)
                    setError(
                        'Diagnosis belum berhasil. Periksa ulang; tidak ada perubahan stok atau jurnal.',
                    );
            }
        });
    }

    return (
        <div className="space-y-6" aria-busy={pending}>
            <p className="rounded-md border p-3 text-sm">
                Pencarian dan diagnosis tidak mengubah data. Koreksi terbatas
                hanya melalui preview dan persetujuan eksplisit Finance; bukan
                persetujuan pemakaian barang.
            </p>
            <AtkPendingRecovery scope={recoveryScope} />
            <fieldset disabled={blocked} className="space-y-6 min-w-0">
            <form
                className="space-y-2"
                onSubmit={(event) => {
                    event.preventDefault();
                    search(1);
                }}
            >
                <Label htmlFor="reconciliation-query">
                    Cari SKU atau nama barang
                </Label>
                <div className="flex flex-wrap gap-2">
                    <Input
                        id="reconciliation-query"
                        value={query}
                        maxLength={100}
                        disabled={pending}
                        className="min-h-11 sm:max-w-md"
                        onChange={(event) => {
                            if (blocked) return;
                            ++request.current;
                            setQuery(event.target.value);
                            setCatalog(null);
                            setDiagnosis(null);
                            setError('');
                        }}
                    />
                    <Button
                        type="submit"
                        disabled={pending}
                        className="min-h-11"
                    >
                        {pending ? 'Memeriksa…' : 'Cari ATK'}
                    </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                    Kosongkan pencarian untuk katalog ATK dengan stok tidak nol.
                    Pencarian juga mencakup SKU arsip/tanpa stok. Daftar ini
                    bukan daftar temuan atau laporan seluruh tenant.
                </p>
            </form>
            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            )}
            {catalog && (
                <section aria-label="Hasil pencarian ATK" className="space-y-3">
                    <p role="status">
                        {catalog.items.length
                            ? `${catalog.items.length} SKU pada halaman ${catalog.page}`
                            : 'Tidak ada SKU pada halaman pencarian ini. Bukan berarti seluruh nilai stok sudah cocok.'}
                    </p>
                    <ul className="grid gap-3 md:grid-cols-2">
                        {catalog.items.map((item) => (
                            <li
                                key={item.id}
                                className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                            >
                                <div>
                                    <p className="font-medium wrap-anywhere">
                                        {item.skuCode} · {item.name}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        {item.unit}
                                        {item.archived ? ' · Diarsipkan' : ''}
                                    </p>
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={pending}
                                    className="min-h-11"
                                    onClick={() => inspect(item.id)}
                                    aria-label={`Periksa ${item.skuCode}`}
                                >
                                    Periksa
                                </Button>
                            </li>
                        ))}
                    </ul>
                    <nav
                        aria-label="Halaman katalog ATK"
                        className="flex gap-2"
                    >
                        <Button
                            type="button"
                            variant="outline"
                            className="min-h-11"
                            disabled={pending || catalog.page <= 1}
                            onClick={() =>
                                search(catalog.page - 1, searchedQuery)
                            }
                        >
                            Sebelumnya
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            className="min-h-11"
                            disabled={pending || !catalog.hasMore}
                            onClick={() =>
                                search(catalog.page + 1, searchedQuery)
                            }
                        >
                            Berikutnya
                        </Button>
                    </nav>
                </section>
            )}
            </fieldset>
            {diagnosis && (
                <>
                    <Button
                        type="button"
                        variant="outline"
                        className="min-h-11"
                        disabled={blocked}
                        onClick={() => inspect(diagnosis.variant.id)}
                    >
                        Periksa ulang SKU
                    </Button>
                    <p role="status" className="text-sm">Diagnosis {diagnosis.variant.skuCode} tersedia di bawah.</p>
                    <InventoryReconciliationDetail data={diagnosis} />
                    <AtkCostRecovery key={`${diagnosis.variant.id}:${diagnosis.checkedAt}`} data={diagnosis} recoveryScope={recoveryScope} />
                </>
            )}
        </div>
    );
}
