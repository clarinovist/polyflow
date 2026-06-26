import React from 'react';
import { PurchaseService } from '@/services/purchasing/purchase-service';
import { PurchaseInvoiceTable } from '@/components/purchasing/orders/PurchaseInvoiceTable';
import { Metadata } from 'next';

import { serializeData } from '@/lib/utils/utils';
import { withTenant } from '@/lib/core/tenant';

export const metadata: Metadata = {
    title: 'Purchase Invoices | PolyFlow',
};

import { parseISO } from 'date-fns';
import { UrlTransactionDateFilter } from '@/components/common/url-transaction-date-filter';

// Wrap with withTenant so prisma routes to the correct tenant DB
const getInvoices = withTenant(async (dateRange?: { startDate?: Date; endDate?: Date }) => {
    return PurchaseService.getPurchaseInvoices(dateRange);
});

export default async function PurchaseInvoicesPage({ searchParams }: { searchParams: Promise<{ startDate?: string, endDate?: string }> }) {
    const params = await searchParams;

    // Only filter by date when explicitly provided via URL params
    const dateRange = params?.startDate && params?.endDate
        ? { startDate: parseISO(params.startDate), endDate: parseISO(params.endDate) }
        : undefined;

    const invoices = await getInvoices(dateRange);

    // Serialize all Prisma objects for Client Components
    const serializedInvoices = serializeData(invoices);

    return (
        <div className="flex flex-col gap-6 p-6">
            <div className="flex items-center justify-between">
                <div className="flex flex-col gap-2">
                    <h1 className="text-3xl font-bold tracking-tight">Purchase Invoices</h1>
                    <p className="text-muted-foreground">
                        Manage supplier bills and payments.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <UrlTransactionDateFilter defaultPreset="all" align="end" />
                </div>
            </div>

            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <PurchaseInvoiceTable invoices={serializedInvoices as any} basePath="/finance/invoices/purchase" />
        </div>
    );
}
