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
    paymentBanks = {},
    pendingPurchaseRemittances = [],
}: SentPaymentsClientProps) {
    const [dialogOpen, setDialogOpen] = useState(false);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        Pembayaran Supplier
                    </h1>
                    <p className="text-muted-foreground">
                        Lacak dan kelola pembayaran yang dikirim ke supplier.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <UrlTransactionDateFilter
                        defaultPreset="this_month"
                        align="end"
                    />
                    <Button onClick={() => setDialogOpen(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Catat Pembayaran
                    </Button>
                </div>
            </div>

            <Tabs defaultValue="transactions">
                <TabsList>
                    <TabsTrigger value="transactions">
                        Transaksi Keluar
                    </TabsTrigger>
                    <TabsTrigger
                        value="remittance"
                        className="flex items-center gap-1.5"
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
