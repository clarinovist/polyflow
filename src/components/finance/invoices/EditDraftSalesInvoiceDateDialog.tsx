'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { updateDraftSalesInvoiceDate } from '@/actions/finance/invoice';
import { toBusinessDateString } from '@/lib/utils/timezone';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    invoice: {
        id: string;
        invoiceNumber: string;
        invoiceDate: Date | string;
        dueDate: Date | string | null;
        termOfPaymentDays: number;
    };
}

export function EditDraftSalesInvoiceDateDialog({
    open,
    onOpenChange,
    invoice,
}: Props) {
    const router = useRouter();
    const currentDate = toBusinessDateString(invoice.invoiceDate);
    const [invoiceDate, setInvoiceDate] = useState(currentDate);
    const [reason, setReason] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const reasonValid = reason.trim().length >= 5;
    const dateChanged = invoiceDate !== currentDate;

    const handleSave = async () => {
        if (!invoiceDate || !dateChanged || !reasonValid) return;
        setIsLoading(true);
        try {
            const result = await updateDraftSalesInvoiceDate(invoice.id, {
                invoiceDate,
                expectedInvoiceDate: currentDate,
                expectedInvoiceNumber: invoice.invoiceNumber,
                reason: reason.trim(),
            });
            if (!result.success) {
                toast.error(result.error || 'Gagal mengubah tanggal invoice.');
                return;
            }
            toast.success('Tanggal invoice draft berhasil diperbarui.');
            onOpenChange(false);
            router.refresh();
        } catch {
            toast.error('Gagal mengubah tanggal invoice.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[520px]">
                <DialogHeader>
                    <DialogTitle>
                        Edit Tanggal Invoice — {invoice.invoiceNumber}
                    </DialogTitle>
                    <DialogDescription>
                        Hanya invoice DRAFT yang dapat diubah. Nomor invoice,
                        jatuh tempo, dan jurnal DRAFT akan diselaraskan
                        otomatis.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="current-invoice-date">
                                Tanggal Saat Ini
                            </Label>
                            <Input
                                id="current-invoice-date"
                                value={currentDate}
                                disabled
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="new-invoice-date">
                                Tanggal Invoice Baru
                            </Label>
                            <Input
                                id="new-invoice-date"
                                type="date"
                                value={invoiceDate}
                                max={toBusinessDateString(new Date())}
                                onChange={(event) =>
                                    setInvoiceDate(event.target.value)
                                }
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="invoice-date-reason">
                            Alasan Perubahan
                        </Label>
                        <Textarea
                            id="invoice-date-reason"
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            minLength={5}
                            maxLength={500}
                            placeholder="Contoh: Barang baru diambil pelanggan pada tanggal ini"
                            aria-describedby="invoice-date-reason-help"
                            required
                        />
                        <p
                            id="invoice-date-reason-help"
                            className="text-xs text-muted-foreground"
                        >
                            Wajib minimal 5 karakter dan akan disimpan dalam
                            audit.
                        </p>
                    </div>

                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                        Perubahan lintas bulan dapat menghasilkan nomor invoice
                        baru. Periode target harus masih terbuka.
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={isLoading}
                    >
                        Batal
                    </Button>
                    <Button
                        type="button"
                        onClick={handleSave}
                        disabled={
                            isLoading ||
                            !invoiceDate ||
                            !dateChanged ||
                            !reasonValid
                        }
                    >
                        {isLoading ? 'Menyimpan...' : 'Simpan Tanggal Invoice'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
