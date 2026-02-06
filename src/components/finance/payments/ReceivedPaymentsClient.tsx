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
        customer: { name: string } | null;
    };
}

interface ReceivedPaymentsClientProps {
    payments: Payment[];
    unpaidInvoices: Invoice[];
}

export function ReceivedPaymentsClient({ payments, unpaidInvoices }: ReceivedPaymentsClientProps) {
    const [dialogOpen, setDialogOpen] = useState(false);

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Customer Payments</h1>
                    <p className="text-muted-foreground">History of payments received from sales.</p>
                </div>
                <Button onClick={() => setDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Record Payment
                </Button>
            </div>

            <SharedPaymentTable
                title="Incoming Transactions"
                description="List of verified payments from your customers."
                payments={payments}
                type="received"
            />

            <RecordCustomerPaymentDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                invoices={unpaidInvoices}
            />
        </div>
    );
}
