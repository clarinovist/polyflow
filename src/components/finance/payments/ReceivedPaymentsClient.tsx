'use client';

import { useState } from 'react';
import { SharedPaymentTable } from '@/components/finance/SharedPaymentTable';
import { RecordCustomerPaymentDialog } from '@/components/finance/payments/RecordCustomerPaymentDialog';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

import type { TenantPaymentBanks } from '@/lib/finance/payment-methods';

interface Payment {
    id: string;
    referenceNumber: string;
    date: Date | string;
    entityName: string;
    amount: number;
    method: string;
    instrumentNumber?: string | null;
    destinationBank?: string | null;
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
    paymentBanks?: TenantPaymentBanks;
}

import { UrlTransactionDateFilter } from '@/components/common/url-transaction-date-filter';

export function ReceivedPaymentsClient({ payments, unpaidInvoices, demandType, paymentBanks = {} }: ReceivedPaymentsClientProps) {
    const [dialogOpen, setDialogOpen] = useState(false);
    const canRecordPayment = unpaidInvoices.length > 0;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Pembayaran Pelanggan</h1>
                    <p className="text-muted-foreground">
                        {demandType === 'customer'
                            ? 'Lacak dan kelola pembayaran yang diterima dari pelanggan.'
                            : 'Tinjau dan rekonsiliasi penerimaan internal lama yang masih tercatat di histori keuangan.'}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <UrlTransactionDateFilter defaultPreset="this_month" align="end" />
                    {canRecordPayment && (
                        <Button onClick={() => setDialogOpen(true)}>
                            <Plus className="mr-2 h-4 w-4" />
                            Catat Pembayaran
                        </Button>
                    )}
                </div>
            </div>

            <SharedPaymentTable
                title="Transaksi Masuk"
                description="Daftar pembayaran pelanggan yang telah terverifikasi."
                payments={payments}
                type="received"
            />

            {canRecordPayment && (
                <RecordCustomerPaymentDialog
                    open={dialogOpen}
                    onOpenChange={setDialogOpen}
                    invoices={unpaidInvoices}
                    paymentBanks={paymentBanks}
                />
            )}
        </div>
    );
}
