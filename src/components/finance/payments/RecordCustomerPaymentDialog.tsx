'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronsUpDown, FileText, Loader2 } from 'lucide-react';

import {
    createBarterSettlement,
    getBarterOptions,
} from '@/actions/finance/barter-actions';
import { recordCustomerPayment } from '@/actions/finance/finance';
import { PaymentMethodFields } from '@/components/finance/payments/PaymentMethodFields';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { BARTER_PAYMENT_METHOD } from '@/lib/finance/barter';
import {
    DEFAULT_PAYMENT_METHOD,
    type PaymentBankKey,
    type PaymentMethod,
    type TenantPaymentBanks,
} from '@/lib/finance/payment-methods';
import { cn, formatRupiah } from '@/lib/utils/utils';
import { toBusinessDateString } from '@/lib/utils/timezone';

interface Invoice {
    id: string;
    invoiceNumber: string;
    totalAmount: number;
    paidAmount: number;
    salesOrder: {
        orderNumber: string;
        customerId?: string | null;
        customer: { name: string } | null;
    };
}

type BarterOptions = {
    eligible: boolean;
    truncated?: boolean;
    supplier?: { id: string; name: string };
    receivableBalance?: number;
    purchaseInvoices: Array<{
        id: string;
        invoiceNumber: string;
        totalAmount: number;
        paidAmount: number;
        dueDate: Date | string | null;
    }>;
};

interface RecordCustomerPaymentDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    invoices: Invoice[];
    paymentBanks?: TenantPaymentBanks;
}

const today = () => toBusinessDateString(new Date());
const toBusinessDate = (date: string) => `${date}T00:00:00+07:00`;

export function RecordCustomerPaymentDialog({
    open,
    onOpenChange,
    invoices,
    paymentBanks = [],
}: RecordCustomerPaymentDialogProps) {
    const { toast } = useToast();
    const idempotencyKey = useRef('');
    const submitting = useRef(false);
    const [loading, setLoading] = useState(false);
    const [loadingBarter, setLoadingBarter] = useState(false);
    const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
    const [amount, setAmount] = useState('');
    const [paymentDate, setPaymentDate] = useState(today());
    const [method, setMethod] = useState<PaymentMethod>(DEFAULT_PAYMENT_METHOD);
    const [referenceNumber, setReferenceNumber] = useState('');
    const [destinationBank, setDestinationBank] = useState<PaymentBankKey | ''>(
        '',
    );
    const [notes, setNotes] = useState('');
    const [invoiceSearchOpen, setInvoiceSearchOpen] = useState(false);
    const [barterOptions, setBarterOptions] = useState<BarterOptions | null>(
        null,
    );
    const [purchaseInvoiceId, setPurchaseInvoiceId] = useState('');
    const [purchaseSearch, setPurchaseSearch] = useState('');
    const [barterError, setBarterError] = useState('');
    const [barterAmount, setBarterAmount] = useState('');
    const [includeCashPayment, setIncludeCashPayment] = useState(false);
    const [cashAmount, setCashAmount] = useState('');
    const [cashMethod, setCashMethod] = useState<PaymentMethod>(
        DEFAULT_PAYMENT_METHOD,
    );
    const [cashReferenceNumber, setCashReferenceNumber] = useState('');
    const [cashDestinationBank, setCashDestinationBank] = useState<
        PaymentBankKey | ''
    >('');
    const [cashPaymentDate, setCashPaymentDate] = useState(today());

    const selectedInvoice = invoices.find(
        (inv) => inv.id === selectedInvoiceId,
    );
    const selectedPurchaseInvoice = barterOptions?.purchaseInvoices.find(
        (invoice) => invoice.id === purchaseInvoiceId,
    );
    const remainingBalance = selectedInvoice
        ? Number(selectedInvoice.totalAmount) -
          Number(selectedInvoice.paidAmount)
        : 0;
    const payableBalance = selectedPurchaseInvoice
        ? Number(selectedPurchaseInvoice.totalAmount) -
          Number(selectedPurchaseInvoice.paidAmount)
        : 0;
    const barterValue = Number(barterAmount) || 0;
    const cashValue = includeCashPayment ? Number(cashAmount) || 0 : 0;
    const isBarter = method === BARTER_PAYMENT_METHOD;
    const cashMethods = [
        'Cash',
        ...paymentBanks.map((bank) => `Transfer ${bank.name}`),
    ].filter((value, index, values) => values.indexOf(value) === index);

    useEffect(() => {
        if (!open) {
            setSelectedInvoiceId('');
            setAmount('');
            setPaymentDate(today());
            setMethod(DEFAULT_PAYMENT_METHOD);
            setReferenceNumber('');
            setDestinationBank('');
            setNotes('');
            setInvoiceSearchOpen(false);
            setBarterOptions(null);
            setPurchaseInvoiceId('');
            setBarterAmount('');
            setIncludeCashPayment(false);
            setCashAmount('');
            setCashMethod(DEFAULT_PAYMENT_METHOD);
            setCashReferenceNumber('');
            setCashDestinationBank('');
            setCashPaymentDate(today());
            idempotencyKey.current = '';
        }
    }, [open]);

    useEffect(() => {
        setMethod(DEFAULT_PAYMENT_METHOD);
        setBarterOptions(null);
        setPurchaseInvoiceId('');
        setBarterAmount('');
        setIncludeCashPayment(false);
        setCashAmount('');
        idempotencyKey.current = '';
        setPurchaseSearch('');
        setBarterError('');
        setLoadingBarter(false);
        if (!selectedInvoiceId) return;

        let cancelled = false;
        setLoadingBarter(true);
        getBarterOptions(selectedInvoiceId)
            .then((result) => {
                if (cancelled) return;
                if (result.success) {
                    setBarterOptions(result.data as BarterOptions);
                } else {
                    setBarterError(result.error);
                    setBarterOptions({ eligible: false, purchaseInvoices: [] });
                }
            })
            .catch(() => {
                if (!cancelled)
                    setBarterError(
                        'Gagal memuat izin barter. Pilih ulang invoice untuk mencoba lagi.',
                    );
            })
            .finally(() => {
                if (!cancelled) setLoadingBarter(false);
            });
        return () => {
            cancelled = true;
        };
    }, [selectedInvoiceId]);

    useEffect(() => {
        if (!isBarter || !selectedInvoiceId) return;
        let cancelled = false;
        const timer = setTimeout(() => {
            setLoadingBarter(true);
            getBarterOptions(selectedInvoiceId, purchaseSearch)
                .then((result) => {
                    if (cancelled) return;
                    if (result.success) {
                        setBarterOptions(result.data as BarterOptions);
                        setBarterError('');
                    } else setBarterError(result.error);
                })
                .catch(() => {
                    if (!cancelled)
                        setBarterError('Gagal mencari invoice hutang.');
                })
                .finally(() => {
                    if (!cancelled) setLoadingBarter(false);
                });
        }, 300);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [isBarter, selectedInvoiceId, purchaseSearch]);

    const submitOrdinaryPayment = async () => {
        const paymentAmount = Number(amount);
        if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
            throw new Error('Masukkan jumlah pembayaran yang valid.');
        }
        if (paymentAmount > remainingBalance) {
            throw new Error(
                `Pembayaran ${formatRupiah(paymentAmount)} melebihi sisa tagihan ${formatRupiah(remainingBalance)}.`,
            );
        }
        if (
            method === 'Check' &&
            (!referenceNumber.trim() || !destinationBank)
        ) {
            throw new Error('Nomor cek/giro dan bank tujuan wajib diisi.');
        }
        return recordCustomerPayment({
            invoiceId: selectedInvoiceId,
            amount: paymentAmount,
            paymentDate: toBusinessDate(paymentDate),
            method,
            notes,
            referenceNumber:
                method === 'Check' ? referenceNumber.trim() : undefined,
            destinationBank: method === 'Check' ? destinationBank : undefined,
        });
    };

    const submitBarter = async () => {
        if (!purchaseInvoiceId) throw new Error('Pilih invoice hutang.');
        if (!notes.trim()) throw new Error('Catatan/kesepakatan wajib diisi.');
        if (!idempotencyKey.current)
            idempotencyKey.current = crypto.randomUUID();
        return createBarterSettlement({
            invoiceId: selectedInvoiceId,
            purchaseInvoiceId,
            barterAmount,
            barterDate: toBusinessDate(paymentDate),
            includeCashPayment,
            cashAmount: includeCashPayment ? cashAmount : undefined,
            cashMethod: includeCashPayment ? cashMethod : undefined,
            cashPaymentDate: includeCashPayment
                ? toBusinessDate(cashPaymentDate)
                : undefined,
            cashReferenceNumber: includeCashPayment
                ? cashReferenceNumber
                : undefined,
            notes,
            idempotencyKey: idempotencyKey.current,
        });
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (submitting.current) return;
        if (!selectedInvoiceId) {
            toast({
                title: 'Error',
                description: 'Pilih invoice terlebih dahulu.',
                variant: 'destructive',
            });
            return;
        }
        submitting.current = true;
        setLoading(true);
        try {
            const result = isBarter
                ? await submitBarter()
                : await submitOrdinaryPayment();
            if (!result.success) {
                toast({
                    title: 'Gagal',
                    description: result.error,
                    variant: 'destructive',
                });
                return;
            }
            toast({
                title: 'Berhasil',
                description:
                    result.data && 'settlementNumber' in result.data
                        ? `Barter ${result.data.settlementNumber} berhasil dicatat.`
                        : result.data?.message,
            });
            onOpenChange(false);
        } catch (error) {
            toast({
                title: 'Gagal',
                description:
                    error instanceof Error
                        ? error.message
                        : 'Gagal mencatat pembayaran.',
                variant: 'destructive',
            });
        } finally {
            submitting.current = false;
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[620px]">
                <DialogHeader>
                    <DialogTitle>Catat Pembayaran</DialogTitle>
                    <DialogDescription>
                        Catat pembayaran biasa atau potong piutang dan hutang
                        untuk pasangan yang telah diizinkan Admin.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="invoice">Invoice pelanggan</Label>
                        <Popover
                            open={invoiceSearchOpen}
                            onOpenChange={setInvoiceSearchOpen}
                        >
                            <PopoverTrigger asChild>
                                <Button
                                    type="button"
                                    variant="outline"
                                    role="combobox"
                                    className={cn(
                                        'h-11 w-full min-w-0 justify-between font-normal',
                                        !selectedInvoiceId &&
                                            'text-muted-foreground',
                                    )}
                                >
                                    {selectedInvoice ? (
                                        <span className="flex min-w-0 items-center gap-2 truncate">
                                            <FileText className="h-4 w-4 shrink-0" />
                                            <span className="truncate">
                                                {selectedInvoice.invoiceNumber}{' '}
                                                —{' '}
                                                {selectedInvoice.salesOrder
                                                    .customer?.name ??
                                                    `Build Stok Internal Lama (${selectedInvoice.salesOrder.orderNumber})`}
                                            </span>
                                        </span>
                                    ) : (
                                        'Pilih invoice yang belum lunas'
                                    )}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent
                                className="w-[--radix-popover-trigger-width] p-0"
                                align="start"
                            >
                                <Command>
                                    <CommandInput placeholder="Cari invoice atau customer..." />
                                    <CommandList>
                                        <CommandEmpty>
                                            Tidak ada invoice.
                                        </CommandEmpty>
                                        <CommandGroup>
                                            {invoices.map((invoice) => (
                                                <CommandItem
                                                    key={invoice.id}
                                                    value={invoice.id}
                                                    keywords={[
                                                        invoice.invoiceNumber,
                                                        invoice.salesOrder
                                                            .customer?.name ??
                                                            '',
                                                    ]}
                                                    onSelect={() => {
                                                        setSelectedInvoiceId(
                                                            invoice.id,
                                                        );
                                                        setInvoiceSearchOpen(
                                                            false,
                                                        );
                                                    }}
                                                >
                                                    <Check
                                                        className={cn(
                                                            'mr-2 h-4 w-4',
                                                            selectedInvoiceId ===
                                                                invoice.id
                                                                ? 'opacity-100'
                                                                : 'opacity-0',
                                                        )}
                                                    />
                                                    <span className="min-w-0 flex-1 truncate">
                                                        {invoice.invoiceNumber}{' '}
                                                        —{' '}
                                                        {invoice.salesOrder
                                                            .customer?.name ??
                                                            'Legacy Internal'}
                                                    </span>
                                                    <span className="font-mono text-xs text-muted-foreground">
                                                        {formatRupiah(
                                                            Number(
                                                                invoice.totalAmount,
                                                            ) -
                                                                Number(
                                                                    invoice.paidAmount,
                                                                ),
                                                        )}
                                                    </span>
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>

                    {selectedInvoice && (
                        <div className="rounded-md bg-muted p-3 text-sm">
                            <div className="flex justify-between font-semibold">
                                <span>Sisa piutang</span>
                                <span>{formatRupiah(remainingBalance)}</span>
                            </div>
                        </div>
                    )}

                    <PaymentMethodFields
                        method={method}
                        onMethodChange={(value) => {
                            setMethod(value);
                            setPurchaseInvoiceId('');
                            setBarterAmount('');
                            setIncludeCashPayment(false);
                            setCashAmount('');
                            idempotencyKey.current = '';
                        }}
                        referenceNumber={referenceNumber}
                        onReferenceNumberChange={setReferenceNumber}
                        destinationBank={destinationBank}
                        onDestinationBankChange={setDestinationBank}
                        paymentBanks={paymentBanks}
                        methodId="customer-method"
                        additionalMethods={
                            barterOptions?.eligible
                                ? [BARTER_PAYMENT_METHOD]
                                : []
                        }
                    />
                    {loadingBarter && selectedInvoice && (
                        <p className="text-xs text-muted-foreground">
                            Memeriksa izin barter...
                        </p>
                    )}

                    {barterError && (
                        <p role="alert" className="text-sm text-red-600">
                            {barterError}
                        </p>
                    )}
                    {isBarter ? (
                        <>
                            <div className="space-y-2">
                                <Label>Supplier pasangan</Label>
                                <Input
                                    value={barterOptions?.supplier?.name ?? ''}
                                    disabled
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="purchase-invoice">
                                    Invoice hutang
                                </Label>
                                <Input
                                    aria-label="Cari invoice hutang"
                                    placeholder="Cari nomor invoice hutang"
                                    value={purchaseSearch}
                                    onChange={(event) => {
                                        setPurchaseSearch(event.target.value);
                                        setPurchaseInvoiceId('');
                                        setBarterAmount('');
                                        setCashAmount('');
                                    }}
                                />
                                {barterOptions?.truncated && (
                                    <p className="text-sm text-amber-600">
                                        Maksimal 200 invoice; persempit
                                        pencarian untuk invoice lainnya.
                                    </p>
                                )}
                                <Select
                                    value={purchaseInvoiceId || undefined}
                                    onValueChange={(value) => {
                                        setPurchaseInvoiceId(value);
                                        setBarterAmount('');
                                        setCashAmount('');
                                        idempotencyKey.current = '';
                                    }}
                                >
                                    <SelectTrigger id="purchase-invoice">
                                        <SelectValue placeholder="Pilih invoice hutang" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {barterOptions?.purchaseInvoices.map(
                                            (invoice) => (
                                                <SelectItem
                                                    key={invoice.id}
                                                    value={invoice.id}
                                                >
                                                    {invoice.invoiceNumber} —{' '}
                                                    {formatRupiah(
                                                        invoice.totalAmount -
                                                            invoice.paidAmount,
                                                    )}
                                                </SelectItem>
                                            ),
                                        )}
                                    </SelectContent>
                                </Select>
                                {barterOptions?.purchaseInvoices.length ===
                                    0 && (
                                    <p className="text-sm text-amber-600">
                                        Tidak ada invoice hutang eligible untuk
                                        supplier pasangan.
                                    </p>
                                )}
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="barter-date">
                                        Tanggal barter
                                    </Label>
                                    <Input
                                        id="barter-date"
                                        type="date"
                                        value={paymentDate}
                                        onChange={(event) => {
                                            setPaymentDate(event.target.value);
                                            idempotencyKey.current = '';
                                        }}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="barter-amount">
                                        Nominal barter
                                    </Label>
                                    <Input
                                        id="barter-amount"
                                        type="number"
                                        step="0.01"
                                        min="0.01"
                                        max={Math.min(
                                            remainingBalance,
                                            payableBalance,
                                        )}
                                        value={barterAmount}
                                        onChange={(event) => {
                                            setBarterAmount(event.target.value);
                                            idempotencyKey.current = '';
                                        }}
                                        required
                                    />
                                </div>
                            </div>
                            <div className="flex items-center gap-2 rounded-md border p-3">
                                <Checkbox
                                    id="include-cash"
                                    checked={includeCashPayment}
                                    onCheckedChange={(checked) => {
                                        setIncludeCashPayment(checked === true);
                                        setCashPaymentDate(paymentDate);
                                        setCashAmount('');
                                        idempotencyKey.current = '';
                                    }}
                                />
                                <Label htmlFor="include-cash">
                                    Catat pembayaran tambahan sekarang
                                </Label>
                            </div>
                            {includeCashPayment && (
                                <div className="space-y-4 rounded-md border p-4">
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label htmlFor="cash-amount">
                                                Jumlah tambahan
                                            </Label>
                                            <Input
                                                id="cash-amount"
                                                type="number"
                                                step="0.01"
                                                min="0.01"
                                                max={Math.max(
                                                    0,
                                                    payableBalance -
                                                        barterValue,
                                                )}
                                                value={cashAmount}
                                                onChange={(event) => {
                                                    setCashAmount(
                                                        event.target.value,
                                                    );
                                                    idempotencyKey.current = '';
                                                }}
                                                required
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="cash-date">
                                                Tanggal pembayaran
                                            </Label>
                                            <Input
                                                id="cash-date"
                                                type="date"
                                                value={cashPaymentDate}
                                                onChange={(event) => {
                                                    setCashPaymentDate(
                                                        event.target.value,
                                                    );
                                                    idempotencyKey.current = '';
                                                }}
                                                required
                                            />
                                        </div>
                                    </div>
                                    <PaymentMethodFields
                                        method={cashMethod}
                                        onMethodChange={(value) => {
                                            setCashMethod(value);
                                            idempotencyKey.current = '';
                                        }}
                                        referenceNumber={cashReferenceNumber}
                                        onReferenceNumberChange={
                                            setCashReferenceNumber
                                        }
                                        destinationBank={cashDestinationBank}
                                        onDestinationBankChange={
                                            setCashDestinationBank
                                        }
                                        paymentBanks={paymentBanks}
                                        methodId="barter-cash-method"
                                        allowedMethods={cashMethods}
                                        label="Metode pembayaran tambahan"
                                    />
                                    <div className="space-y-2">
                                        <Label htmlFor="cash-reference">
                                            Referensi transfer (opsional)
                                        </Label>
                                        <Input
                                            id="cash-reference"
                                            value={cashReferenceNumber}
                                            onChange={(event) => {
                                                setCashReferenceNumber(
                                                    event.target.value,
                                                );
                                                idempotencyKey.current = '';
                                            }}
                                        />
                                    </div>
                                </div>
                            )}
                            <div className="rounded-md bg-muted p-3 text-sm space-y-1">
                                <div className="flex justify-between">
                                    <span>Potong piutang</span>
                                    <span>{formatRupiah(barterValue)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Potong hutang</span>
                                    <span>{formatRupiah(barterValue)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Uang keluar</span>
                                    <span>{formatRupiah(cashValue)}</span>
                                </div>
                                <div className="flex justify-between border-t pt-1 font-semibold">
                                    <span>Sisa piutang / hutang</span>
                                    <span>
                                        {formatRupiah(
                                            Math.max(
                                                0,
                                                remainingBalance - barterValue,
                                            ),
                                        )}
                                        {' / '}
                                        {formatRupiah(
                                            Math.max(
                                                0,
                                                payableBalance -
                                                    barterValue -
                                                    cashValue,
                                            ),
                                        )}
                                    </span>
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="space-y-2">
                                <Label htmlFor="amount">
                                    Jumlah Pembayaran
                                </Label>
                                <Input
                                    id="amount"
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    max={remainingBalance}
                                    value={amount}
                                    onChange={(event) =>
                                        setAmount(event.target.value)
                                    }
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="paymentDate">
                                    Tanggal Pembayaran
                                </Label>
                                <Input
                                    id="paymentDate"
                                    type="date"
                                    value={paymentDate}
                                    onChange={(event) =>
                                        setPaymentDate(event.target.value)
                                    }
                                    required
                                />
                            </div>
                        </>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="notes">
                            Catatan{isBarter ? '/kesepakatan' : ' (Opsional)'}
                        </Label>
                        <Textarea
                            id="notes"
                            value={notes}
                            onChange={(event) => {
                                setNotes(event.target.value);
                                if (isBarter) idempotencyKey.current = '';
                            }}
                            required={isBarter}
                            rows={3}
                        />
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={loading}
                        >
                            Batal
                        </Button>
                        <Button
                            type="submit"
                            disabled={
                                loading ||
                                !selectedInvoiceId ||
                                (isBarter &&
                                    (!purchaseInvoiceId ||
                                        loadingBarter ||
                                        !barterOptions?.eligible ||
                                        Boolean(barterError)))
                            }
                        >
                            {loading && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            {isBarter
                                ? 'Konfirmasi Barter'
                                : 'Catat Pembayaran'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
