'use client';

import { useState } from 'react';
import { SharedPaymentTable } from '@/components/finance/SharedPaymentTable';
import { RecordCustomerPaymentDialog } from '@/components/finance/payments/RecordCustomerPaymentDialog';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

interface Payment {
    id: string;
    referenceNumber: string;
    date: Date | string;
    entityName: string;
    amount: number;
    method: string;
    status: string;
}

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

interface ReceivedPaymentsClientProps {
    payments: Payment[];
    unpaidInvoices: Invoice[];
    demandType: 'customer' | 'legacy-internal';
}

import { UrlTransactionDateFilter } from '@/components/common/url-transaction-date-filter';

export function ReceivedPaymentsClient({ payments, unpaidInvoices, demandType }: ReceivedPaymentsClientProps) {
    const [dialogOpen, setDialogOpen] = useState(false);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Customer Payments</h1>
                    <p className="text-muted-foreground">
                        {demandType === 'customer'
                            ? 'Track and manage payments received from customers.'
                            : 'Review and reconcile legacy internal receipts that still exist in finance history.'}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <UrlTransactionDateFilter defaultPreset="this_month" align="end" />
                    {demandType === 'customer' && (
                        <Button onClick={() => setDialogOpen(true)}>
                            <Plus className="mr-2 h-4 w-4" />
                            Record Payment
                        </Button>
                    )}
                </div>
            </div>

            <SharedPaymentTable
                title="Incoming Transactions"
                description="List of verified payments from your customers."
                payments={payments}
                type="received"
            />

            {demandType === 'customer' && (
                <RecordCustomerPaymentDialog
                    open={dialogOpen}
                    onOpenChange={setDialogOpen}
                    invoices={unpaidInvoices}
                />
            )}
        </div>
    );
}
