'use client';

import { useId, useRef, useState, useTransition } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { hasAnyRole } from '@/lib/auth/roles';
import { closePurchaseOrder } from '@/actions/purchasing/close-purchase-order';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';

export function ClosePurchaseOrderDialog({
    id,
    orderNumber,
}: {
    id: string;
    orderNumber: string;
}) {
    const { data: session } = useSession();
    const router = useRouter();
    const reasonId = useId();
    const submitting = useRef(false);
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');
    const [pending, startTransition] = useTransition();

    if (!hasAnyRole(session?.user, ['ADMIN', 'PROCUREMENT'])) return null;

    function changeOpen(value: boolean) {
        if (submitting.current) return;
        setOpen(value);
        setReason('');
        setError('');
    }

    function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (submitting.current || !reason.trim()) return;
        submitting.current = true;
        setError('');
        startTransition(async () => {
            try {
                const result = await closePurchaseOrder(id, reason.trim());
                if (!result.success) {
                    setError(
                        result.error || 'Gagal menutup PO. Silakan coba lagi.',
                    );
                    return;
                }
                toast.success(
                    'PO ditutup. Penerimaan dan tagihan sebelumnya tetap tersimpan.',
                );
                setOpen(false);
                setReason('');
                router.refresh();
            } catch {
                setError('Gagal menutup PO. Silakan coba lagi.');
            } finally {
                submitting.current = false;
            }
        });
    }

    return (
        <Dialog open={open} onOpenChange={changeOpen}>
            <DialogTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    aria-label={`Tutup PO ${orderNumber}`}
                >
                    Tutup PO
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg" showCloseButton={!pending}>
                <form onSubmit={submit} className="space-y-4">
                    <DialogHeader>
                        <DialogTitle>Tutup PO {orderNumber}?</DialogTitle>
                        <DialogDescription>
                            Gunakan jika sisa barang tidak akan dikirim lagi.
                            Status menjadi Ditutup, bukan Diterima Lengkap.
                            Jumlah pesanan, penerimaan aktual, stok, dan tagihan
                            yang sudah tercatat tidak berubah. PO tidak dapat
                            menerima barang lagi setelah ditutup.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Label htmlFor={reasonId}>Alasan penutupan</Label>
                        <Textarea
                            id={reasonId}
                            required
                            maxLength={1000}
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            disabled={pending}
                            placeholder="Contoh: Supplier tidak akan mengirim sisa pesanan."
                            aria-describedby={
                                error ? `${reasonId}-error` : undefined
                            }
                        />
                    </div>
                    {error && (
                        <p
                            id={`${reasonId}-error`}
                            role="alert"
                            className="text-sm text-destructive"
                        >
                            {error}
                        </p>
                    )}
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => changeOpen(false)}
                            disabled={pending}
                        >
                            Batal
                        </Button>
                        <Button
                            type="submit"
                            disabled={pending || !reason.trim()}
                        >
                            {pending ? 'Menutup...' : 'Ya, Tutup PO'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
