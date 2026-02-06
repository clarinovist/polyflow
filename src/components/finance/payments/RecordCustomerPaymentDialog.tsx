'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { recordCustomerPayment } from '@/actions/finance';
import { formatRupiah } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Invoice {
    id: string;
    invoiceNumber: string;
    totalAmount: number;
    paidAmount: number;
    salesOrder: {
        customer: { name: string } | null;
    };
}

interface RecordCustomerPaymentDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    invoices: Invoice[];
}

export function RecordCustomerPaymentDialog({ open, onOpenChange, invoices }: RecordCustomerPaymentDialogProps) {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
    const [amount, setAmount] = useState('');
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
    const [method, setMethod] = useState('Bank Transfer');
    const [notes, setNotes] = useState('');

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
        }
    }, [open]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const result = await recordCustomerPayment({
                invoiceId: selectedInvoiceId,
                amount: parseFloat(amount),
                paymentDate: new Date(paymentDate),
                method,
                notes
            });

            if (result.success) {
                toast({
                    title: 'Success',
                    description: result.message,
                });
                onOpenChange(false);
            } else {
                toast({
                    title: 'Error',
                    description: result.error,
                    variant: 'destructive'
                });
            }
        } catch (error) {
            toast({
                title: 'Error',
                description: error instanceof Error ? error.message : 'Failed to record payment',
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
                    <DialogTitle>Record Customer Payment</DialogTitle>
                    <DialogDescription>
                        Record a payment received from a customer for their invoice.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="invoice">Select Invoice</Label>
                        <Select value={selectedInvoiceId} onValueChange={setSelectedInvoiceId} required>
                            <SelectTrigger>
                                <SelectValue placeholder="Choose an unpaid invoice" />
                            </SelectTrigger>
                            <SelectContent>
                                {invoices.map((inv) => {
                                    const balance = Number(inv.totalAmount) - Number(inv.paidAmount);
                                    return (
                                        <SelectItem key={inv.id} value={inv.id}>
                                            {inv.invoiceNumber} - {inv.salesOrder.customer?.name || 'Unknown'} ({formatRupiah(balance)})
                                        </SelectItem>
                                    );
                                })}
                            </SelectContent>
                        </Select>
                    </div>

                    {selectedInvoice && (
                        <div className="p-3 bg-muted rounded-md text-sm space-y-1">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Total Amount:</span>
                                <span className="font-medium">{formatRupiah(Number(selectedInvoice.totalAmount))}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Paid Amount:</span>
                                <span className="font-medium text-emerald-600">{formatRupiah(Number(selectedInvoice.paidAmount))}</span>
                            </div>
                            <div className="flex justify-between border-t pt-1">
                                <span className="text-muted-foreground font-semibold">Remaining Balance:</span>
                                <span className="font-bold text-red-600">{formatRupiah(remainingBalance)}</span>
                            </div>
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="amount">Payment Amount</Label>
                        <Input
                            id="amount"
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
                        <Label htmlFor="paymentDate">Payment Date</Label>
                        <Input
                            id="paymentDate"
                            type="date"
                            value={paymentDate}
                            onChange={(e) => setPaymentDate(e.target.value)}
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="method">Payment Method</Label>
                        <Select value={method} onValueChange={setMethod} required>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                                <SelectItem value="Cash">Cash</SelectItem>
                                <SelectItem value="Check">Check</SelectItem>
                                <SelectItem value="Credit Card">Credit Card</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="notes">Notes (Optional)</Label>
                        <Textarea
                            id="notes"
                            placeholder="Add any additional notes..."
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={3}
                        />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading || !selectedInvoiceId}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Record Payment
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
