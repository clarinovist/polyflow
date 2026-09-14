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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { format } from 'date-fns';
import { PAYMENT_TERM_OPTIONS } from '@/lib/finance/payment-terms';
import type { SerializedSalesOrder } from '../sales-order-types';

interface InvoiceDialogProps {
    order: SerializedSalesOrder;
    invoiceDialogOpen: boolean;
    setInvoiceDialogOpen: (open: boolean) => void;
    invoiceDate: string;
    setInvoiceDate: (date: string) => void;
    termDays: number;
    setTermDays: (days: number) => void;
    customTermDays: string;
    setCustomTermDays: (days: string) => void;
    useManualDue: boolean;
    setUseManualDue: (manual: boolean) => void;
    manualDueDate: string;
    setManualDueDate: (date: string) => void;
    computedDueDate: Date;
    isLoading: boolean;
    handleGenerateInvoice: () => Promise<void>;
}

export function InvoiceDialog({
    order,
    invoiceDialogOpen,
    setInvoiceDialogOpen,
    invoiceDate,
    setInvoiceDate,
    termDays,
    setTermDays,
    customTermDays,
    setCustomTermDays,
    useManualDue,
    setUseManualDue,
    manualDueDate,
    setManualDueDate,
    computedDueDate,
    isLoading,
    handleGenerateInvoice,
}: InvoiceDialogProps) {
    return (
        <Dialog
            open={invoiceDialogOpen}
            onOpenChange={setInvoiceDialogOpen}
        >
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle>
                        Buat Sales Invoice
                    </DialogTitle>
                    <DialogDescription>
                        Tentukan tanggal invoice &
                        tempo. Jatuh tempo = Invoice
                        + Tempo (atau manual).
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label>
                                Tanggal Invoice
                            </Label>
                            <Input
                                type="date"
                                value={invoiceDate}
                                onChange={(e) =>
                                    setInvoiceDate(
                                        e.target
                                            .value,
                                    )
                                }
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>
                                Tempo Default
                                Customer
                            </Label>
                            <div className="text-sm font-medium py-2">
                                {order.customer
                                    ?.paymentTermDays ??
                                    30}{' '}
                                hari (dari master
                                customer)
                            </div>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label>
                            Tempo Pembayaran
                        </Label>
                        <Select
                            value={String(termDays)}
                            onValueChange={(v) =>
                                setTermDays(
                                    parseInt(v, 10),
                                )
                            }
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {PAYMENT_TERM_OPTIONS.map(
                                    (opt) => (
                                        <SelectItem
                                            key={
                                                opt.value
                                            }
                                            value={String(
                                                opt.value,
                                            )}
                                        >
                                            {
                                                opt.label
                                            }
                                        </SelectItem>
                                    ),
                                )}
                                <SelectItem value="-1">
                                    Custom...
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {termDays === -1 && (
                        <div className="space-y-1.5">
                            <Label>
                                Custom Tempo (hari)
                            </Label>
                            <Input
                                type="number"
                                min={0}
                                max={365}
                                value={
                                    customTermDays
                                }
                                onChange={(e) =>
                                    setCustomTermDays(
                                        e.target
                                            .value,
                                    )
                                }
                                placeholder="Misal 21"
                            />
                        </div>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                        <input
                            id="manual-due-sales"
                            type="checkbox"
                            checked={useManualDue}
                            onChange={(e) =>
                                setUseManualDue(
                                    e.target.checked,
                                )
                            }
                            className="h-4 w-4"
                        />
                        <Label
                            htmlFor="manual-due-sales"
                            className="cursor-pointer"
                        >
                            Input tanggal jatuh tempo
                            manual
                        </Label>
                    </div>

                    {useManualDue && (
                        <div className="space-y-1.5">
                            <Label>
                                Tanggal Jatuh Tempo
                                (manual)
                            </Label>
                            <Input
                                type="date"
                                value={
                                    manualDueDate
                                }
                                onChange={(e) =>
                                    setManualDueDate(
                                        e.target
                                            .value,
                                    )
                                }
                            />
                        </div>
                    )}

                    <div className="rounded-md bg-muted p-3 text-sm">
                        <div className="text-muted-foreground">
                            Preview Jatuh Tempo:
                        </div>
                        <div className="font-bold text-base mt-1">
                            {format(
                                computedDueDate,
                                'dd MMM yyyy',
                            )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                            Rumus: Invoice{' '}
                            {invoiceDate
                                ? format(
                                      new Date(
                                          invoiceDate,
                                      ),
                                      'dd MMM yyyy',
                                  )
                                : '-'}{' '}
                            +{' '}
                            {useManualDue
                                ? 'Manual'
                                : `${termDays === -1 ? customTermDays || 0 : termDays} hari`}
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() =>
                            setInvoiceDialogOpen(
                                false,
                            )
                        }
                    >
                        Batal
                    </Button>
                    <Button
                        onClick={
                            handleGenerateInvoice
                        }
                        disabled={isLoading}
                    >
                        {isLoading
                            ? 'Membuat...'
                            : 'Buat Invoice'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
