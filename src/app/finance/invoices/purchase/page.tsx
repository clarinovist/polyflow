import React from 'react';
import { PurchaseService } from '@/services/purchase-service';
import { PurchaseInvoiceTable } from '@/components/planning/purchasing/PurchaseInvoiceTable';
import { Metadata } from 'next';
import { ShoppingCart } from 'lucide-react';
import { serializeData } from '@/lib/utils';

export const metadata: Metadata = {
    title: 'Purchase Invoices | PolyFlow',
};

import { startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { UrlTransactionDateFilter } from '@/components/ui/url-transaction-date-filter';

export default async function PurchaseInvoicesPage({ searchParams }: { searchParams: Promise<{ startDate?: string, endDate?: string }> }) {
    const params = await searchParams;
    const now = new Date();
    const defaultStart = startOfMonth(now);
    const defaultEnd = endOfMonth(now);

    const checkStart = params?.startDate ? parseISO(params.startDate) : defaultStart;
    const checkEnd = params?.endDate ? parseISO(params.endDate) : defaultEnd;

    const invoices = await PurchaseService.getPurchaseInvoices({ startDate: checkStart, endDate: checkEnd });

    // Serialize all Prisma objects for Client Components
    const serializedInvoices = serializeData(invoices);

    return (
        <div className="flex flex-col gap-6 p-6">
            <div className="flex items-center justify-between">
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                        <ShoppingCart className="h-3 w-3" />
                        <span>Payables / Invoices</span>
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight">Purchase Invoices</h1>
                    <p className="text-muted-foreground">
                        Manage supplier bills and payments.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <UrlTransactionDateFilter defaultPreset="this_month" align="end" />
                </div>
            </div>

            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <PurchaseInvoiceTable invoices={serializedInvoices as any} basePath="/finance/invoices/purchase" />
        </div>
    );
}
