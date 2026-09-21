'use client';

import { useState } from 'react';
import { SharedPaymentTable } from '@/components/finance/SharedPaymentTable';
import { RecordCustomerPaymentDialog } from '@/components/finance/payments/RecordCustomerPaymentDialog';
import {
    RemittanceVerificationQueue,
    type RemittanceQueueRow,
} from '@/components/finance/payments/RemittanceVerificationQueue';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
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
    creditedAmount?: number;
    priceAdjustmentAmount?: number;
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
    pendingRemittances?: RemittanceQueueRow[];
}

import { UrlTransactionDateFilter } from '@/components/common/url-transaction-date-filter';

export function ReceivedPaymentsClient({
    payments,
    unpaidInvoices,
    demandType,
    paymentBanks = [],
    pendingRemittances = [],
}: ReceivedPaymentsClientProps) {
    const [dialogOpen, setDialogOpen] = useState(false);
    const canRecordPayment = unpaidInvoices.length > 0;

    return (
        <div className="min-w-0 space-y-5">
            <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
                        Pembayaran Pelanggan
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {demandType === 'customer'
                            ? 'Lacak dan kelola pembayaran yang diterima dari pelanggan.'
                            : 'Tinjau dan rekonsiliasi penerimaan internal lama yang masih tercatat di histori keuangan.'}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 [&_button]:min-h-11">
                    <UrlTransactionDateFilter
                        defaultPreset="this_month"
                        align="end"
                    />
                    {canRecordPayment && (
                        <Button className="h-auto max-w-full whitespace-normal" onClick={() => setDialogOpen(true)}>
                            <Plus className="mr-2 h-4 w-4" />
                            Catat Pembayaran
                        </Button>
                    )}
                </div>
            </div>

            <Tabs defaultValue="transactions">
                <TabsList className="grid h-auto w-full grid-cols-2 md:w-fit">
                    <TabsTrigger
                        value="transactions"
                        className="min-h-11 whitespace-normal text-center"
                    >
                        Transaksi Masuk
                    </TabsTrigger>
                    <TabsTrigger
                        value="remittance"
                        className="flex min-h-11 items-center gap-1.5 whitespace-normal text-center"
                    >
                        Setoran Menunggu Verifikasi
                        {pendingRemittances.length > 0 && (
                            <Badge variant="secondary" className="text-[10px]">
                                {pendingRemittances.length}
                            </Badge>
                        )}
                    </TabsTrigger>
                </TabsList>
                <TabsContent value="transactions" className="mt-4">
                    <SharedPaymentTable
                        title="Transaksi Masuk"
                        description="Daftar pembayaran pelanggan yang telah terverifikasi."
                        payments={payments}
                        type="received"
                    />
                </TabsContent>
                <TabsContent value="remittance" className="mt-4">
                    <RemittanceVerificationQueue
                        initialRemittances={pendingRemittances}
                    />
                </TabsContent>
            </Tabs>

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
