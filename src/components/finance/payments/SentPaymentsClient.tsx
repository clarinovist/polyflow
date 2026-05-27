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

import { UrlTransactionDateFilter } from '@/components/common/url-transaction-date-filter';

export function SentPaymentsClient({ payments, unpaidInvoices }: SentPaymentsClientProps) {
    const [dialogOpen, setDialogOpen] = useState(false);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Pembayaran Supplier</h1>
                    <p className="text-muted-foreground">Lacak dan kelola pembayaran yang dikirim ke supplier.</p>
                </div>
                <div className="flex items-center gap-2">
                    <UrlTransactionDateFilter defaultPreset="this_month" align="end" />
                    <Button onClick={() => setDialogOpen(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Catat Pembayaran
                    </Button>
                </div>
            </div>

            <SharedPaymentTable
                title="Transaksi Keluar"
                description="Daftar pembayaran ke supplier yang telah selesai diproses."
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
