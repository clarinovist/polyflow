'use client';

import { useState } from 'react';
import { SharedPaymentTable } from '@/components/finance/SharedPaymentTable';
import { RecordSupplierPaymentDialog } from '@/components/finance/payments/RecordSupplierPaymentDialog';
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

interface PurchaseInvoice {
    id: string;
    invoiceNumber: string;
    totalAmount: number;
    paidAmount: number;
    purchaseOrder: {
        supplier: { name: string };
    };
}

interface SentPaymentsClientProps {
    payments: Payment[];
    unpaidInvoices: PurchaseInvoice[];
}

export function SentPaymentsClient({ payments, unpaidInvoices }: SentPaymentsClientProps) {
    const [dialogOpen, setDialogOpen] = useState(false);

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Supplier Payments</h1>
                    <p className="text-muted-foreground">History of payments sent to vendors.</p>
                </div>
                <Button onClick={() => setDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Record Payment
                </Button>
            </div>

            <SharedPaymentTable
                title="Outgoing Transactions"
                description="List of completed payments to suppliers."
                payments={payments}
                type="sent"
            />

            <RecordSupplierPaymentDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                invoices={unpaidInvoices}
            />
        </div>
    );
}
