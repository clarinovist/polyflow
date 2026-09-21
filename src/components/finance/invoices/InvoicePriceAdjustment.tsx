'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
    getInvoicePriceAdjustmentContext,
    postFinanceInvoicePriceAdjustment,
    reverseFinanceInvoicePriceAdjustment,
} from '@/actions/finance/invoice-price-adjustment';
import { calculatePriceAdjustment } from '@/lib/finance/invoice-price-adjustment';
import { toBusinessDateString } from '@/lib/utils/timezone';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
type Context = Extract<
    Awaited<ReturnType<typeof getInvoicePriceAdjustmentContext>>,
    { success: true }
>['data'];
const money = (value: string | number) =>
    new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 2,
    }).format(Number(value));
export function InvoicePriceAdjustment({ invoiceId }: { invoiceId: string }) {
    const router = useRouter();
    const [open, setOpen] = useState(false),
        [context, setContext] = useState<Context | null>(null),
        [error, setError] = useState(''),
        [itemId, setItem] = useState(''),
        [quantity, setQuantity] = useState(''),
        [price, setPrice] = useState(''),
        [reason, setReason] = useState(''),
        [confirmed, setConfirmed] = useState(false),
        [date, setDate] = useState(toBusinessDateString(new Date())),
        [pending, startTransition] = useTransition();
    const key = useRef('');
    const busy = useRef(false);
    const [revision, setRevision] = useState(0);
    const [reversingId, setReversingId] = useState<string | null>(null);
    const [success, setSuccess] = useState('');
    const reversing = context?.history.find(row => row.id === reversingId);
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        getInvoicePriceAdjustmentContext(invoiceId)
            .then((result) => {
                if (cancelled) return;
                if (result.success) {
                    setContext(result.data);
                    key.current = crypto.randomUUID();
                } else setError(result.error || 'Gagal memuat sumber invoice.');
            })
            .catch(() => {
                if (!cancelled) setError('Gagal memuat sumber invoice.');
            });
        return () => {
            cancelled = true;
        };
    }, [open, invoiceId, revision]);
    const item = context?.items.find((i) => i.sourceItemId === itemId);
    let value: ReturnType<typeof calculatePriceAdjustment> | null = null;
    try {
        if (item)
            value = calculatePriceAdjustment({
                sourceQuantity: item.quantity,
                sourceNet: item.netAmount,
                sourceTax: item.taxAmount,
                quantity,
                newNetUnitPrice: price,
            });
    } catch {
        /* Invalid/incomplete local form; server validates again. */
    }
    const after =
        context && value
            ? Number(context.remaining) + Number(value.totalAmount)
            : null;
    const submit = (adjustmentId?: string) => {
        if (
            busy.current ||
            !context ||
            reason.trim().length < 5 ||
            !confirmed ||
            !date ||
            (!adjustmentId && (!value || after === null || after < 0 || !item || Number(quantity) > Number(item.availableQuantity)))
        )
            return;
        busy.current = true;
        startTransition(async () => {
            setError('');
            try {
                const result = adjustmentId
                    ? await reverseFinanceInvoicePriceAdjustment({
                          adjustmentId,
                          reversalDate: `${date}T00:00:00+07:00`,
                          reason,
                      })
                    : await postFinanceInvoicePriceAdjustment({
                          invoiceId,
                          sourceItemId: itemId,
                          quantity,
                          newNetUnitPrice: price,
                          reason,
                          postingDate: `${date}T00:00:00+07:00`,
                          expectedRemaining: context.remaining,
                          sourceFingerprint: context.sourceFingerprint,
                          idempotencyKey: key.current,
                          confirmed: true,
                      });
                if (!result.success) {
                    setError(result.error || 'Transaksi gagal.');
                    return;
                }
                setSuccess(adjustmentId ? 'Penyesuaian dibalik dengan jurnal kompensasi. Saldo invoice diperbarui.' : 'Penyesuaian terposting. Saldo invoice diperbarui tanpa mengubah pembayaran atau stok.');
                setReversingId(null);
                setItem('');
                setQuantity('');
                setPrice('');
                setConfirmed(false);
                setContext(null);
                setRevision((v) => v + 1);
                router.refresh();
            } catch {
                setError(
                    'Hasil transaksi belum pasti. Muat ulang sebelum mencoba lagi; jangan membuat penyesuaian pengganti.',
                );
            } finally {
                busy.current = false;
            }
        });
    };
    return (
        <>
            <Button
                variant="outline"
                onClick={() => {
                    setError('');
                    setSuccess('');
                    setContext(null);
                    setConfirmed(false);
                    setReversingId(null);
                    setOpen(true);
                }}
            >
                Sesuaikan Harga
            </Button>
            <Dialog
                open={open}
                onOpenChange={(v) => {
                    if (!pending) setOpen(v);
                }}
            >
                <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Penyesuaian harga invoice</DialogTitle>
                        <DialogDescription>
                            Catat selisih harga tanpa mengubah invoice, stok,
                            atau pembayaran.
                        </DialogDescription>
                    </DialogHeader>
                    {!context && !error && (
                        <p role="status">Memuat sumber harga…</p>
                    )}
                    {success && <p role="status">{success}</p>}
                    {context && (
                        <div className="space-y-4 text-sm">
                            <p>
                                {context.invoiceNumber} · Sisa sekarang:{' '}
                                <strong>{money(context.remaining)}</strong>
                            </p>
                            {!context.sourceError && (
                                <p className="text-muted-foreground">
                                    {context.sourceLabel}
                                </p>
                            )}
                            {context.sourceError && (
                                <div
                                    role="alert"
                                    className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-3"
                                >
                                    <p className="font-semibold">
                                        Penyesuaian belum tersedia
                                    </p>
                                    <p>{context.sourceError}</p>
                                </div>
                            )}
                            {(!context.sourceError || reversing) && (
                                <fieldset disabled={pending} className="space-y-3">
                                    {!context.sourceError && (
                                        <>
                                <Label htmlFor="price-source-item">
                                    Barang yang disesuaikan
                                </Label>
                                <select
                                    id="price-source-item"
                                    className="border-input bg-background min-h-11 w-full rounded border px-3"
                                    value={itemId}
                                    onChange={(e) => {
                                        setItem(e.target.value);
                                        setConfirmed(false);
                                    }}
                                >
                                    <option value="">Pilih item</option>
                                    {context.items.map((i) => (
                                        <option
                                            key={i.sourceItemId}
                                            value={i.sourceItemId}
                                            disabled={
                                                Number(i.availableQuantity) <= 0
                                            }
                                        >
                                            {i.name} ({i.unit}) — harga netto{' '}
                                            {money(i.netUnitPrice)}; qty
                                            tersedia {i.availableQuantity}
                                        </option>
                                    ))}
                                </select>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="space-y-1">
                                        <Label htmlFor="price-quantity">
                                            Qty yang terdampak
                                        </Label>
                                        <Input
                                            id="price-quantity"
                                            inputMode="decimal"
                                            value={quantity}
                                            onChange={(e) => {
                                                setQuantity(e.target.value);
                                                setConfirmed(false);
                                            }}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="price-new">
                                            Harga netto baru per unit (Rp,
                                            sebelum pajak)
                                        </Label>
                                        <Input
                                            id="price-new"
                                            inputMode="decimal"
                                            value={price}
                                            onChange={(e) => {
                                                setPrice(e.target.value);
                                                setConfirmed(false);
                                            }}
                                        />
                                    </div>
                                </div>
                                {value && (
                                    <div className="rounded bg-muted p-3">
                                        <p>
                                            Harga netto asal:{' '}
                                            {money(value.oldNetUnitPrice)}
                                        </p>
                                        <p>
                                            Selisih netto:{' '}
                                            {money(value.netAmount)} · pajak:{' '}
                                            {money(value.taxAmount)}
                                        </p>
                                        <p className="font-semibold">
                                            {Number(value.totalAmount) < 0
                                                ? 'Pengurangan'
                                                : 'Penambahan'}{' '}
                                            tagihan:{' '}
                                            {money(
                                                Math.abs(
                                                    Number(value.totalAmount),
                                                ),
                                            )}
                                        </p>
                                        <p>
                                            Sisa setelah penyesuaian:{' '}
                                            {money(after!)}
                                        </p>
                                    </div>
                                )}
                                {after !== null && after < 0 && (
                                    <p role="alert">
                                        Penurunan melebihi sisa piutang. Perlu
                                        pemeriksaan Finance, bukan refund
                                        otomatis.
                                    </p>
                                )}
                                        </>
                                    )}
                                <Label htmlFor="price-reason">
                                    Alasan penyesuaian / pembalikan
                                </Label>
                                <Textarea
                                    id="price-reason"
                                    value={reason}
                                    maxLength={1000}
                                    onChange={(e) => {
                                        setReason(e.target.value);
                                        setConfirmed(false);
                                    }}
                                />
                                <Label htmlFor="price-date">
                                    Tanggal posting / pembalikan
                                </Label>
                                <Input
                                    id="price-date"
                                    type="date"
                                    value={date}
                                    onChange={(e) => {
                                        setDate(e.target.value);
                                        setConfirmed(false);
                                    }}
                                />
                                <label className="flex gap-3">
                                    <input
                                        type="checkbox"
                                        checked={confirmed}
                                        onChange={(e) =>
                                            setConfirmed(e.target.checked)
                                        }
                                        className="mt-1 size-5 shrink-0"
                                    />
                                    <span>
                                        Saya menyetujui sumber harga, kuantitas,
                                        pajak, alasan dan dampak saldo transaksi
                                        ini.
                                    </span>
                                </label>
                                {!context.sourceError && (
                                    <Button
                                        disabled={
                                            !value ||
                                            !confirmed ||
                                            reason.trim().length < 5 ||
                                            pending ||
                                            !!reversingId ||
                                            !item ||
                                            Number(quantity) >
                                                Number(item.availableQuantity) ||
                                            after === null ||
                                            after < 0
                                        }
                                        onClick={() => submit()}
                                    >
                                        Konfirmasi & posting penyesuaian
                                    </Button>
                                )}
                                </fieldset>
                            )}
                            <div className="space-y-2">
                                <h4 className="font-semibold">
                                    Riwayat penyesuaian
                                </h4>
                                {!context.history.length && (
                                    <p>Belum ada penyesuaian harga.</p>
                                )}
                                {context.history.map((h) => (
                                    <div
                                        key={h.id}
                                        className="space-y-1 rounded border p-3"
                                    >
                                        <p>
                                            {h.status} · {money(h.totalAmount)}{' '}
                                            · {h.reason}
                                        </p>
                                        <p>
                                            {toBusinessDateString(
                                                new Date(h.postingDate),
                                            )}{' '}
                                            · {h.createdBy.name ?? 'Finance'}
                                        </p>
                                        {h.status === 'POSTED' && (
                                            <Button
                                                variant="outline"
                                                disabled={
                                                    pending
                                                }
                                                onClick={() => {
                                                    setReversingId(h.id);
                                                    setConfirmed(false);
                                                    setReason('');
                                                }}
                                            >
                                                Balikkan penyesuaian
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>
                            {reversing && <div className="space-y-2 rounded border border-destructive p-3">
                                <p className="font-semibold">Konfirmasi pembalikan {money(reversing.totalAmount)}</p>
                                <p>Alasan awal: {reversing.reason}</p>
                                <p>Sisa sekarang {money(context.remaining)} → setelah pembalikan {money(Number(context.remaining) - Number(reversing.totalAmount))}.</p>
                                <p>Isi alasan pembalikan dan centang persetujuan di atas. Tidak ada refund atau perubahan stok.</p>
                                <Button variant="destructive" disabled={pending || !confirmed || reason.trim().length < 5 || !date} onClick={() => submit(reversing.id)}>Konfirmasi pembalikan harga</Button>
                                <Button variant="outline" disabled={pending} onClick={() => { setReversingId(null); setConfirmed(false); }}>Batal pembalikan</Button>
                            </div>}
                        </div>
                    )}
                    {error && (
                        <p role="alert" className="break-words">
                            {error}
                        </p>
                    )}
                    <Button
                        variant="outline"
                        disabled={pending}
                        onClick={() => {
                            setError('');
                            setSuccess('');
                            setContext(null);
                            setConfirmed(false);
                            setReversingId(null);
                            setRevision((v) => v + 1);
                        }}
                    >
                        Muat ulang sumber
                    </Button>
                </DialogContent>
            </Dialog>
        </>
    );
}
