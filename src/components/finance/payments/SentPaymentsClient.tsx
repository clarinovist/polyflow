'use client';

import { useState } from 'react';
import { SharedPaymentTable } from '@/components/finance/SharedPaymentTable';
import { RecordSupplierPaymentDialog } from '@/components/finance/payments/RecordSupplierPaymentDialog';
import {
    PurchaseRemittanceVerificationQueue,
    type PurchaseRemittanceQueueRow,
} from '@/components/finance/payments/PurchaseRemittanceVerificationQueue';
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

interface PurchaseInvoice {
    id: string;
    invoiceNumber: string;
    totalAmount: number;
    paidAmount: number;
    purchaseOrder?: {
        supplier?: { name: string } | null;
    } | null;
}

interface SentPaymentsClientProps {
    payments: Payment[];
    unpaidInvoices: PurchaseInvoice[];
    paymentBanks?: TenantPaymentBanks;
    pendingPurchaseRemittances?: PurchaseRemittanceQueueRow[];
}

import { UrlTransactionDateFilter } from '@/components/common/url-transaction-date-filter';

export function SentPaymentsClient({
    payments,
    unpaidInvoices,
    paymentBanks = [],
    pendingPurchaseRemittances = [],
}: SentPaymentsClientProps) {
    const [dialogOpen, setDialogOpen] = useState(false);

    return (
        <div className="min-w-0 space-y-5">
            <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
                        Pembayaran Supplier
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Lacak dan kelola pembayaran yang dikirim ke supplier.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 [&_button]:min-h-11">
                    <UrlTransactionDateFilter
                        defaultPreset="this_month"
                        align="end"
                    />
                    <Button className="h-auto max-w-full whitespace-normal" onClick={() => setDialogOpen(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Catat Pembayaran
                    </Button>
                </div>
            </div>

            <Tabs defaultValue="transactions">
                <TabsList className="grid h-auto w-full grid-cols-2 md:w-fit">
                    <TabsTrigger
                        value="transactions"
                        className="min-h-11 whitespace-normal text-center"
                    >
                        Transaksi Keluar
                    </TabsTrigger>
                    <TabsTrigger
                        value="remittance"
                        className="flex min-h-11 items-center gap-1.5 whitespace-normal text-center"
                    >
                        Setoran Menunggu Verifikasi
                        {pendingPurchaseRemittances.length > 0 && (
                            <Badge variant="secondary" className="text-[10px]">
                                {pendingPurchaseRemittances.length}
                            </Badge>
                        )}
                    </TabsTrigger>
                </TabsList>
                <TabsContent value="transactions" className="mt-4">
                    <SharedPaymentTable
                        title="Transaksi Keluar"
                        description="Daftar pembayaran ke supplier yang telah selesai diproses."
                        payments={payments}
                        type="sent"
                    />
                </TabsContent>
                <TabsContent value="remittance" className="mt-4">
                    <PurchaseRemittanceVerificationQueue
                        initialRemittances={pendingPurchaseRemittances}
                    />
                </TabsContent>
            </Tabs>

            <RecordSupplierPaymentDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                invoices={unpaidInvoices}
                paymentBanks={paymentBanks}
            />
        </div>
    );
}
