'use client';

import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { recordSupplierPayment } from '@/actions/finance/finance';
import { formatRupiah, cn } from '@/lib/utils/utils';
import { Loader2, ChevronsUpDown, Check, Receipt } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
    DEFAULT_PAYMENT_METHOD,
    type PaymentBankKey,
    type PaymentMethod,
    type TenantPaymentBanks,
} from '@/lib/finance/payment-methods';
import { PaymentMethodFields } from '@/components/finance/payments/PaymentMethodFields';
import { isInvoiceOverdue } from '@/lib/purchasing/payment-terms';
import { format } from 'date-fns';

interface PurchaseInvoice {
    id: string;
    invoiceNumber: string;
    totalAmount: number;
    paidAmount: number;
    invoiceDate?: Date | string;
    dueDate?: Date | string | null;
    status?: string;
    termOfPaymentDays?: number | null;
    purchaseOrder?: {
        supplier?: { name: string } | null;
    } | null;
}

interface RecordSupplierPaymentDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    invoices: PurchaseInvoice[];
    paymentBanks?: TenantPaymentBanks;
}

export function RecordSupplierPaymentDialog({ open, onOpenChange, invoices, paymentBanks = {} }: RecordSupplierPaymentDialogProps) {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
    const [amount, setAmount] = useState('');
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
    const [method, setMethod] = useState<PaymentMethod>(DEFAULT_PAYMENT_METHOD);
    const [referenceNumber, setReferenceNumber] = useState('');
    const [destinationBank, setDestinationBank] = useState<PaymentBankKey | ''>('');
    const [notes, setNotes] = useState('');
    const [invoiceSearchOpen, setInvoiceSearchOpen] = useState(false);

    // Sort: overdue first, then earliest due date
    const sortedInvoices = useMemo(() => {
        return [...invoices].sort((a, b) => {
            const aOver = isInvoiceOverdue(a.dueDate, a.status);
            const bOver = isInvoiceOverdue(b.dueDate, b.status);
            if (aOver && !bOver) return -1;
            if (!aOver && bOver) return 1;
            const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
            const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
            return aDue - bDue;
        });
    }, [invoices]);

    const selectedInvoice = sortedInvoices.find(inv => inv.id === selectedInvoiceId);
    const remainingBalance = selectedInvoice
        ? Number(selectedInvoice.totalAmount) - Number(selectedInvoice.paidAmount)
        : 0;

    // Reset form when dialog closes
    useEffect(() => {
        if (!open) {
            setSelectedInvoiceId('');
            setAmount('');
            setPaymentDate(new Date().toISOString().split('T')[0]);
            setMethod(DEFAULT_PAYMENT_METHOD);
            setReferenceNumber('');
            setDestinationBank('');
            setNotes('');
            setInvoiceSearchOpen(false);
        }
    }, [open]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const parsedAmount = parseFloat(amount);

        // Client-side validation: prevent overpayment
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            toast({
                title: 'Error',
                description: 'Silakan masukkan jumlah pembayaran yang valid.',
                variant: 'destructive'
            });
            return;
        }

        if (parsedAmount > remainingBalance) {
            toast({
                title: 'Error',
                description: `Jumlah pembayaran (${formatRupiah(parsedAmount)}) tidak boleh melebihi sisa tagihan (${formatRupiah(remainingBalance)}).`,
                variant: 'destructive'
            });
            return;
        }

        // Show confirmation for partial payments
        if (parsedAmount < remainingBalance) {
            const confirmed = window.confirm(
                `Pembayaran ${formatRupiah(parsedAmount)} adalah pembayaran sebagian dari sisa tagihan ${formatRupiah(remainingBalance)}.\n\nSisa yang belum dibayar: ${formatRupiah(remainingBalance - parsedAmount)}\n\nLanjutkan?`
            );
            if (!confirmed) return;
        }

        if (method === 'Check') {
            if (!referenceNumber.trim()) {
                toast({
                    title: 'Error',
                    description: 'Nomor Cek / Giro wajib diisi.',
                    variant: 'destructive'
                });
                return;
            }
            if (!destinationBank) {
                toast({
                    title: 'Error',
                    description: 'Pilih bank tujuan clearing.',
                    variant: 'destructive'
                });
                return;
            }
        }

        setLoading(true);

        try {
            const result = await recordSupplierPayment({
                invoiceId: selectedInvoiceId,
                amount: parsedAmount,
                paymentDate: new Date(paymentDate),
                method,
                notes,
                referenceNumber: method === 'Check' ? referenceNumber.trim() : undefined,
                destinationBank: method === 'Check' ? destinationBank : undefined,
            });

            if (result.success) {
                toast({
                    title: 'Berhasil',
                    description: result.data?.message,
                });
                onOpenChange(false);
            } else {
                toast({
                    title: 'Gagal',
                    description: result.error,
                    variant: 'destructive'
                });
            }
        } catch {
            toast({
                title: 'Gagal',
                description: 'Gagal mencatat pembayaran supplier. Silakan coba lagi.',
                variant: 'destructive'
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Catat Pembayaran Supplier</DialogTitle>
                    <DialogDescription>
                        Catat pembayaran yang dikirim ke supplier untuk invoice mereka.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="invoice">Pilih Invoice Pembelian</Label>
                        <Popover open={invoiceSearchOpen} onOpenChange={setInvoiceSearchOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    type="button"
                                    variant="outline"
                                    role="combobox"
                                    aria-expanded={invoiceSearchOpen}
                                    className={cn(
                                        "w-full justify-between font-normal min-w-0 h-11",
                                        !selectedInvoiceId && "text-muted-foreground",
                                    )}
                                >
                                    {selectedInvoice ? (
                                        <span className="flex items-center gap-2 truncate min-w-0">
                                            <Receipt className="h-4 w-4 shrink-0 text-muted-foreground" />
                                            <span className="truncate flex-1 text-left">
                                                {selectedInvoice.invoiceNumber} — {selectedInvoice.purchaseOrder?.supplier?.name ?? '—'}
                                            </span>
                                            <span className="text-xs text-muted-foreground shrink-0 font-mono">
                                                {formatRupiah(Number(selectedInvoice.totalAmount) - Number(selectedInvoice.paidAmount))}
                                            </span>
                                        </span>
                                    ) : (
                                        <span className="truncate">Pilih invoice yang belum lunas</span>
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
                                        // value embeds invoice number + supplier + id so search never depends on id lookup
                                        if (!search.trim()) return 1;
                                        return val.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
                                    }}
                                >
                                    <CommandInput placeholder="Cari no invoice atau supplier..." />
                                    <CommandList className="max-h-[320px]">
                                        <CommandEmpty>Tidak ada invoice ditemukan.</CommandEmpty>
                                        <CommandGroup>
                                            {sortedInvoices.map((inv) => {
                                                const balance = Number(inv.totalAmount) - Number(inv.paidAmount);
                                                const supplierName = inv.purchaseOrder?.supplier?.name ?? '—';
                                                const overdue = isInvoiceOverdue(inv.dueDate, inv.status);
                                                const searchValue = `${inv.invoiceNumber} ${supplierName} ${inv.id}`;
                                                return (
                                                    <CommandItem
                                                        key={inv.id}
                                                        value={searchValue}
                                                        onSelect={() => {
                                                            setSelectedInvoiceId((prev) => (prev === inv.id ? '' : inv.id));
                                                            setInvoiceSearchOpen(false);
                                                        }}
                                                        className={`flex items-center gap-2 ${overdue ? 'bg-red-50 dark:bg-red-950/20' : ''}`}
                                                    >
                                                        <Check
                                                            className={cn(
                                                                "h-4 w-4 shrink-0",
                                                                selectedInvoiceId === inv.id ? "opacity-100" : "opacity-0",
                                                            )}
                                                        />
                                                        <div className="flex flex-col min-w-0 flex-1">
                                                            <span className={`truncate font-medium flex items-center gap-1 ${overdue ? 'text-red-700' : ''}`}>
                                                                {inv.invoiceNumber}
                                                                {overdue && <span className="text-[9px] bg-red-100 text-red-700 px-1 rounded">Terlambat</span>}
                                                            </span>
                                                            <span className="text-xs text-muted-foreground flex gap-2">
                                                                <span>{supplierName}</span>
                                                                {inv.dueDate && <span>· JT {format(new Date(inv.dueDate), 'dd MMM yy')}</span>}
                                                            </span>
                                                        </div>
                                                        <span className="text-xs font-mono text-muted-foreground shrink-0">
                                                            {formatRupiah(balance)}
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

                    {selectedInvoice && (
                        <div className="p-3 bg-muted rounded-md text-sm space-y-1">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Total Tagihan:</span>
                                <span className="font-medium">{formatRupiah(Number(selectedInvoice.totalAmount))}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Sudah Dibayar:</span>
                                <span className="font-medium text-emerald-600">{formatRupiah(Number(selectedInvoice.paidAmount))}</span>
                            </div>
                            {selectedInvoice.dueDate && (
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Jatuh Tempo:</span>
                                    <span className={`font-medium ${isInvoiceOverdue(selectedInvoice.dueDate, selectedInvoice.status) ? 'text-red-600 font-bold' : ''}`}>
                                        {format(new Date(selectedInvoice.dueDate), 'dd MMM yyyy')}
                                        {selectedInvoice.termOfPaymentDays != null && ` (${selectedInvoice.termOfPaymentDays === 0 ? 'Cash' : `${selectedInvoice.termOfPaymentDays} hari`})`}
                                    </span>
                                </div>
                            )}
                            <div className="flex justify-between border-t pt-1">
                                <span className="text-muted-foreground font-semibold">Sisa Tagihan:</span>
                                <span className="font-bold text-red-600">{formatRupiah(remainingBalance)}</span>
                            </div>
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="amount">Jumlah Pembayaran</Label>
                        <div className="flex gap-2">
                            <Input
                                id="amount"
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                max={remainingBalance}
                                className="flex-1"
                                required
                            />
                            {selectedInvoice && remainingBalance > 0 && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setAmount(remainingBalance.toString())}
                                    className="shrink-0 text-xs"
                                >
                                    Bayar Lunas
                                </Button>
                            )}
                        </div>
                        {parseFloat(amount) > remainingBalance && remainingBalance > 0 && (
                            <p className="text-xs text-red-500 mt-1">
                                ⚠️ Jumlah melebihi sisa tagihan ({formatRupiah(remainingBalance)})
                            </p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="paymentDate">Tanggal Pembayaran</Label>
                        <Input
                            id="paymentDate"
                            type="date"
                            value={paymentDate}
                            onChange={(e) => setPaymentDate(e.target.value)}
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
                        methodId="supplier-method"
                    />

                    <div className="space-y-2">
                        <Label htmlFor="notes">Catatan (Opsional)</Label>
                        <Textarea
                            id="notes"
                            placeholder="Tambahkan catatan tambahan..."
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={3}
                        />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                            Batal
                        </Button>
                        <Button type="submit" disabled={loading || !selectedInvoiceId}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Catat Pembayaran
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
