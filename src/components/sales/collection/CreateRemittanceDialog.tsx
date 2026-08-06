'use client';

import { useRef, useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { createRemittanceAction } from '@/actions/sales/collection';
import { formatRupiah, cn } from '@/lib/utils/utils';
import { compressImageForUpload } from '@/lib/media/compress-image';
import {
    Loader2,
    ChevronsUpDown,
    Check,
    FileText,
    Camera,
    X,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
    DEFAULT_PAYMENT_METHOD,
    type PaymentBankKey,
    type PaymentMethod,
    type TenantPaymentBanks,
} from '@/lib/finance/payment-methods';
import { PaymentMethodFields } from '@/components/finance/payments/PaymentMethodFields';

interface Invoice {
    id: string;
    invoiceNumber: string;
    totalAmount: number;
    paidAmount: number;
    salesOrder: {
        orderNumber: string;
        customer: { name: string } | null;
    };
}

interface UploadedProof {
    url: string;
    key: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
}

interface CreateRemittanceDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    invoices: Invoice[];
    paymentBanks?: TenantPaymentBanks;
    onCreated?: () => void;
}

export function CreateRemittanceDialog({
    open,
    onOpenChange,
    invoices,
    paymentBanks = {},
    onCreated,
}: CreateRemittanceDialogProps) {
    const { toast } = useToast();
    const [submitting, setSubmitting] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
    const [amount, setAmount] = useState('');
    const [collectedAt, setCollectedAt] = useState(
        new Date().toISOString().split('T')[0],
    );
    const [method, setMethod] = useState<PaymentMethod>(DEFAULT_PAYMENT_METHOD);
    const [referenceNumber, setReferenceNumber] = useState('');
    const [destinationBank, setDestinationBank] = useState<PaymentBankKey | ''>(
        '',
    );
    const [notes, setNotes] = useState('');
    const [invoiceSearchOpen, setInvoiceSearchOpen] = useState(false);
    const [proof, setProof] = useState<UploadedProof | null>(null);
    const photoInputRef = useRef<HTMLInputElement>(null);

    const selectedInvoice = invoices.find(
        (inv) => inv.id === selectedInvoiceId,
    );
    const remainingBalance = selectedInvoice
        ? Number(selectedInvoice.totalAmount) -
          Number(selectedInvoice.paidAmount)
        : 0;

    const resetForm = () => {
        setSelectedInvoiceId('');
        setAmount('');
        setCollectedAt(new Date().toISOString().split('T')[0]);
        setMethod(DEFAULT_PAYMENT_METHOD);
        setReferenceNumber('');
        setDestinationBank('');
        setNotes('');
        setInvoiceSearchOpen(false);
        setProof(null);
    };

    useEffect(() => {
        if (!open) resetForm();
    }, [open]);

    const handlePhotoSelect = async (
        e: React.ChangeEvent<HTMLInputElement>,
    ) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;

        setUploading(true);
        try {
            const uploadFile = file.type.startsWith('image/')
                ? await compressImageForUpload(file)
                : file;

            const formData = new FormData();
            formData.append('file', uploadFile);

            const response = await fetch('/api/upload/remittance-proof', {
                method: 'POST',
                body: formData,
            });

            let result: {
                key?: string;
                url?: string;
                originalName?: string;
                mimeType?: string;
                sizeBytes?: number;
                error?: string;
            };
            try {
                result = await response.json();
            } catch {
                toast({
                    title: 'Gagal',
                    description: `Upload gagal (HTTP ${response.status}).`,
                    variant: 'destructive',
                });
                return;
            }

            if (!response.ok || !result.key || !result.url) {
                toast({
                    title: 'Gagal',
                    description: result.error || 'Upload bukti gagal.',
                    variant: 'destructive',
                });
                return;
            }

            setProof({
                url: result.url,
                key: result.key,
                originalName: result.originalName || file.name,
                mimeType: result.mimeType || file.type,
                sizeBytes: result.sizeBytes || file.size,
            });
        } catch {
            toast({
                title: 'Gagal',
                description: 'Gagal mengunggah bukti. Cek koneksi.',
                variant: 'destructive',
            });
        } finally {
            setUploading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!selectedInvoiceId) {
            toast({
                title: 'Error',
                description: 'Pilih invoice terlebih dahulu',
                variant: 'destructive',
            });
            return;
        }

        const submittedAmount = parseFloat(amount);
        if (isNaN(submittedAmount) || submittedAmount <= 0) {
            toast({
                title: 'Error',
                description: 'Masukkan jumlah setoran yang valid',
                variant: 'destructive',
            });
            return;
        }

        if (submittedAmount > remainingBalance) {
            toast({
                title: 'Error',
                description: `Setoran ${formatRupiah(submittedAmount)} melebihi sisa tagihan ${formatRupiah(remainingBalance)}`,
                variant: 'destructive',
            });
            return;
        }

        if (method === 'Check') {
            if (!referenceNumber.trim()) {
                toast({
                    title: 'Error',
                    description: 'Nomor Cek / Giro wajib diisi',
                    variant: 'destructive',
                });
                return;
            }
            if (!destinationBank) {
                toast({
                    title: 'Error',
                    description: 'Pilih bank tujuan clearing',
                    variant: 'destructive',
                });
                return;
            }
        }

        setSubmitting(true);
        try {
            const result = await createRemittanceAction({
                collectedAt: new Date(collectedAt),
                notes: notes || undefined,
                items: [
                    {
                        invoiceId: selectedInvoiceId,
                        amount: submittedAmount,
                        method,
                        referenceNumber:
                            method === 'Check'
                                ? referenceNumber.trim()
                                : undefined,
                        proofUrl: proof?.url,
                        proofStorageKey: proof?.key,
                        proofOriginalName: proof?.originalName,
                        proofMimeType: proof?.mimeType,
                        proofSizeBytes: proof?.sizeBytes,
                    },
                ],
            });

            if (result.success) {
                toast({
                    title: 'Berhasil',
                    description: `Setoran ${formatRupiah(submittedAmount)} diajukan, menunggu verifikasi finance.`,
                });
                onOpenChange(false);
                onCreated?.();
            } else {
                toast({
                    title: 'Gagal',
                    description: result.error,
                    variant: 'destructive',
                });
            }
        } catch {
            toast({
                title: 'Gagal',
                description: 'Gagal mengajukan setoran. Silakan coba lagi.',
                variant: 'destructive',
            });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Ajukan Setoran</DialogTitle>
                    <DialogDescription>
                        Catat bukti pembayaran yang diterima dari customer (mis.
                        transfer via WA) untuk diverifikasi finance.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="remittance-invoice">
                            Pilih Invoice
                        </Label>
                        <Popover
                            open={invoiceSearchOpen}
                            onOpenChange={setInvoiceSearchOpen}
                        >
                            <PopoverTrigger asChild>
                                <Button
                                    type="button"
                                    variant="outline"
                                    role="combobox"
                                    aria-expanded={invoiceSearchOpen}
                                    className={cn(
                                        'w-full justify-between font-normal min-w-0 h-11',
                                        !selectedInvoiceId &&
                                            'text-muted-foreground',
                                    )}
                                >
                                    {selectedInvoice ? (
                                        <span className="flex items-center gap-2 truncate min-w-0">
                                            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                                            <span className="truncate flex-1 text-left">
                                                {selectedInvoice.invoiceNumber}{' '}
                                                —{' '}
                                                {selectedInvoice.salesOrder
                                                    .customer?.name ||
                                                    selectedInvoice.salesOrder
                                                        .orderNumber}
                                            </span>
                                            <span className="text-xs text-muted-foreground shrink-0 font-mono">
                                                {formatRupiah(
                                                    Number(
                                                        selectedInvoice.totalAmount,
                                                    ) -
                                                        Number(
                                                            selectedInvoice.paidAmount,
                                                        ),
                                                )}
                                            </span>
                                        </span>
                                    ) : (
                                        <span className="truncate">
                                            Pilih invoice yang belum lunas
                                        </span>
                                    )}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent
                                className="w-[--radix-popover-trigger-width] p-0"
                                align="start"
                            >
                                <Command
                                    filter={(val, search) => {
                                        const inv = invoices.find(
                                            (i) => i.id === val,
                                        );
                                        if (!inv) return 0;
                                        const q = search.toLowerCase();
                                        const customerName =
                                            inv.salesOrder.customer?.name ||
                                            inv.salesOrder.orderNumber;
                                        return inv.invoiceNumber
                                            .toLowerCase()
                                            .includes(q) ||
                                            customerName
                                                .toLowerCase()
                                                .includes(q)
                                            ? 1
                                            : 0;
                                    }}
                                >
                                    <CommandInput placeholder="Cari no invoice atau customer..." />
                                    <CommandList>
                                        <CommandEmpty>
                                            Tidak ada invoice ditemukan.
                                        </CommandEmpty>
                                        <CommandGroup>
                                            {invoices.map((inv) => {
                                                const balance =
                                                    Number(inv.totalAmount) -
                                                    Number(inv.paidAmount);
                                                const customerLabel =
                                                    inv.salesOrder.customer
                                                        ?.name ||
                                                    inv.salesOrder.orderNumber;
                                                return (
                                                    <CommandItem
                                                        key={inv.id}
                                                        value={inv.id}
                                                        onSelect={(
                                                            currentValue,
                                                        ) => {
                                                            setSelectedInvoiceId(
                                                                currentValue ===
                                                                    selectedInvoiceId
                                                                    ? ''
                                                                    : currentValue,
                                                            );
                                                            setInvoiceSearchOpen(
                                                                false,
                                                            );
                                                        }}
                                                        className="flex items-center gap-2"
                                                    >
                                                        <Check
                                                            className={cn(
                                                                'h-4 w-4 shrink-0',
                                                                selectedInvoiceId ===
                                                                    inv.id
                                                                    ? 'opacity-100'
                                                                    : 'opacity-0',
                                                            )}
                                                        />
                                                        <div className="flex flex-col min-w-0 flex-1">
                                                            <span className="truncate font-medium">
                                                                {
                                                                    inv.invoiceNumber
                                                                }
                                                            </span>
                                                            <span className="text-xs text-muted-foreground">
                                                                {customerLabel}
                                                            </span>
                                                        </div>
                                                        <span className="text-xs font-mono text-muted-foreground shrink-0">
                                                            {formatRupiah(
                                                                balance,
                                                            )}
                                                        </span>
                                                    </CommandItem>
                                                );
                                            })}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="remittance-amount">
                            Jumlah Setoran
                        </Label>
                        <Input
                            id="remittance-amount"
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            max={remainingBalance}
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="remittance-collected-at">
                            Tanggal Diterima
                        </Label>
                        <Input
                            id="remittance-collected-at"
                            type="date"
                            value={collectedAt}
                            onChange={(e) => setCollectedAt(e.target.value)}
                            required
                        />
                    </div>

                    <PaymentMethodFields
                        method={method}
                        onMethodChange={setMethod}
                        referenceNumber={referenceNumber}
                        onReferenceNumberChange={setReferenceNumber}
                        destinationBank={destinationBank}
                        onDestinationBankChange={setDestinationBank}
                        paymentBanks={paymentBanks}
                        methodId="remittance-method"
                    />

                    <div className="space-y-2">
                        <Label>Bukti Transfer (Opsional)</Label>
                        {proof ? (
                            <div className="flex items-center gap-2 rounded-md border p-2 text-sm">
                                {proof.mimeType.startsWith('image/') ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={proof.url}
                                        alt={proof.originalName}
                                        className="h-10 w-10 rounded object-cover"
                                    />
                                ) : (
                                    <FileText className="h-5 w-5 text-muted-foreground" />
                                )}
                                <span className="truncate flex-1">
                                    {proof.originalName}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setProof(null)}
                                    className="text-muted-foreground hover:text-foreground"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        ) : (
                            <Button
                                type="button"
                                variant="outline"
                                className="w-full"
                                disabled={uploading}
                                onClick={() => photoInputRef.current?.click()}
                            >
                                {uploading ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Camera className="mr-2 h-4 w-4" />
                                )}
                                Upload Screenshot Bukti Transfer
                            </Button>
                        )}
                        <input
                            ref={photoInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/heic"
                            onChange={handlePhotoSelect}
                            className="hidden"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="remittance-notes">
                            Catatan (Opsional)
                        </Label>
                        <Textarea
                            id="remittance-notes"
                            placeholder="Tambahkan catatan tambahan..."
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={3}
                        />
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={submitting}
                        >
                            Batal
                        </Button>
                        <Button
                            type="submit"
                            disabled={
                                submitting || uploading || !selectedInvoiceId
                            }
                        >
                            {submitting && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            Ajukan Setoran
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
