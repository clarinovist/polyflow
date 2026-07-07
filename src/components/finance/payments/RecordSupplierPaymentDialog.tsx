'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { recordSupplierPayment } from '@/actions/finance/finance';
import { formatRupiah, cn } from '@/lib/utils/utils';
import { Loader2, ChevronsUpDown, Check, Receipt } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface PurchaseInvoice {
    id: string;
    invoiceNumber: string;
    totalAmount: number;
    paidAmount: number;
    purchaseOrder: {
        supplier: { name: string };
    };
}

interface RecordSupplierPaymentDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    invoices: PurchaseInvoice[];
}

export function RecordSupplierPaymentDialog({ open, onOpenChange, invoices }: RecordSupplierPaymentDialogProps) {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
    const [amount, setAmount] = useState('');
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
    const [method, setMethod] = useState('Bank Transfer');
    const [notes, setNotes] = useState('');
    const [invoiceSearchOpen, setInvoiceSearchOpen] = useState(false);

    const selectedInvoice = invoices.find(inv => inv.id === selectedInvoiceId);
    const remainingBalance = selectedInvoice
        ? Number(selectedInvoice.totalAmount) - Number(selectedInvoice.paidAmount)
        : 0;

    // Reset form when dialog closes
    useEffect(() => {
        if (!open) {
            setSelectedInvoiceId('');
            setAmount('');
            setPaymentDate(new Date().toISOString().split('T')[0]);
            setMethod('Bank Transfer');
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

        setLoading(true);

        try {
            const result = await recordSupplierPayment({
                invoiceId: selectedInvoiceId,
                amount: parsedAmount,
                paymentDate: new Date(paymentDate),
                method,
                notes
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
                                                {selectedInvoice.invoiceNumber} — {selectedInvoice.purchaseOrder.supplier.name}
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
                                        const inv = invoices.find(i => i.id === val);
                                        if (!inv) return 0;
                                        const q = search.toLowerCase();
                                        return inv.invoiceNumber.toLowerCase().includes(q) ||
                                            inv.purchaseOrder.supplier.name.toLowerCase().includes(q)
                                            ? 1
                                            : 0;
                                    }}
                                >
                                    <CommandInput placeholder="Cari no invoice atau supplier..." />
                                    <CommandList>
                                        <CommandEmpty>Tidak ada invoice ditemukan.</CommandEmpty>
                                        <CommandGroup>
                                            {invoices.map((inv) => {
                                                const balance = Number(inv.totalAmount) - Number(inv.paidAmount);
                                                return (
                                                    <CommandItem
                                                        key={inv.id}
                                                        value={inv.id}
                                                        onSelect={(currentValue) => {
                                                            setSelectedInvoiceId(currentValue === selectedInvoiceId ? '' : currentValue);
                                                            setInvoiceSearchOpen(false);
                                                        }}
                                                        className="flex items-center gap-2"
                                                    >
                                                        <Check
                                                            className={cn(
                                                                "h-4 w-4 shrink-0",
                                                                selectedInvoiceId === inv.id ? "opacity-100" : "opacity-0",
                                                            )}
                                                        />
                                                        <div className="flex flex-col min-w-0 flex-1">
                                                            <span className="truncate font-medium">
                                                                {inv.invoiceNumber}
                                                            </span>
                                                            <span className="text-xs text-muted-foreground">
                                                                {inv.purchaseOrder.supplier.name}
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

                    <div className="space-y-2">
                        <Label htmlFor="method">Metode Pembayaran</Label>
                        <Select value={method} onValueChange={setMethod} required>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Bank Transfer">Transfer Bank</SelectItem>
                                <SelectItem value="Cash">Tunai</SelectItem>
                                <SelectItem value="Check">Cek</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

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
