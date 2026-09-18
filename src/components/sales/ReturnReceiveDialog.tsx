'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
    getSalesReturnShipmentSources,
    receiveSalesReturnAction,
} from '@/actions/sales/sales-returns';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

type Sources = {
    returnItemId: string;
    sources: {
        id: string;
        quantity: number;
        reference: string;
        createdAt: string;
    }[];
}[];

export function ReturnReceiveDialog({
    returnId,
    items,
}: {
    returnId: string;
    items: { id: string; name: string }[];
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [sources, setSources] = useState<Sources>([]);
    const [selection, setSelection] = useState<Record<string, string>>({});
    const [error, setError] = useState('');
    async function load() {
        setSources([]);
        setSelection({});
        setOpen(true);
        setBusy(true);
        setError('');
        try {
            const result = await getSalesReturnShipmentSources(returnId);
            if (!result.success) {
                setError(result.error);
                return;
            }
            setSources(result.data);
            setSelection(
                Object.fromEntries(
                    result.data
                        .filter((item) => item.sources.length === 1)
                        .map((item) => [item.returnItemId, item.sources[0].id]),
                ),
            );
        } catch {
            setError('Gagal memuat sumber pengiriman. Coba lagi.');
        } finally {
            setBusy(false);
        }
    }
    async function receive() {
        setBusy(true);
        setError('');
        try {
            const result = await receiveSalesReturnAction(
                returnId,
                sources.map((item) => ({
                    returnItemId: item.returnItemId,
                    sourceMovementId: selection[item.returnItemId],
                })),
            );
            if (!result.success) {
                setError(result.error);
                return;
            }
            toast.success(
                'Barang retur diterima. Kredit invoice diproses terpisah oleh Finance.',
            );
            setOpen(false);
            router.refresh();
        } catch {
            setError('Penerimaan gagal. Periksa status sebelum mencoba lagi.');
        } finally {
            setBusy(false);
        }
    }
    return (
        <>
            <Button onClick={load} disabled={busy}>
                Terima Item
            </Button>
            <Dialog
                open={open}
                onOpenChange={(value) => {
                    if (!busy) setOpen(value);
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Sumber pengiriman retur</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground">
                        Pilih pengiriman asal setiap item. HPP memakai jurnal
                        sumber, bukan harga jual. Barang rusak tidak ditambahkan
                        ke stok siap jual.
                    </p>
                    {error && (
                        <p role="alert" className="text-sm text-destructive">
                            {error}
                        </p>
                    )}
                    {sources.map((item) => (
                        <div key={item.returnItemId} className="space-y-2">
                            <Label
                                htmlFor={`return-source-${item.returnItemId}`}
                            >
                                {items.find(
                                    (row) => row.id === item.returnItemId,
                                )?.name ?? 'Item retur'}
                            </Label>
                            <select
                                id={`return-source-${item.returnItemId}`}
                                disabled={busy}
                                className="h-10 w-full rounded border bg-background px-2 text-sm"
                                value={selection[item.returnItemId] ?? ''}
                                onChange={(event) =>
                                    setSelection((previous) => ({
                                        ...previous,
                                        [item.returnItemId]: event.target.value,
                                    }))
                                }
                            >
                                <option value="">Pilih pengiriman</option>
                                {item.sources.map((source) => (
                                    <option key={source.id} value={source.id}>
                                        {source.reference} · qty{' '}
                                        {source.quantity}
                                    </option>
                                ))}
                            </select>
                            {!item.sources.length && (
                                <p className="text-sm text-destructive">
                                    Sumber pengiriman tidak ditemukan. Periksa
                                    dokumen asal.
                                </p>
                            )}
                        </div>
                    ))}
                    <DialogFooter>
                        <Button
                            variant="outline"
                            disabled={busy}
                            onClick={load}
                        >
                            Muat ulang sumber
                        </Button>
                        <Button
                            disabled={
                                busy ||
                                sources.length !== items.length ||
                                sources.some(
                                    (item) => !selection[item.returnItemId],
                                )
                            }
                            onClick={receive}
                        >
                            {busy ? 'Memproses…' : 'Konfirmasi penerimaan'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
