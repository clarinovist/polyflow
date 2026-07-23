import React from 'react';
import { PurchaseService } from '@/services/purchasing/purchase-service';
import { PurchaseInvoiceTable } from '@/components/purchasing/orders/PurchaseInvoiceTable';
import { Metadata } from 'next';

import { serializeData } from '@/lib/utils/utils';
import { withTenant } from '@/lib/core/tenant';

export const metadata: Metadata = {
    title: 'Invoice Purchase | PolyFlow',
};

import { parseISO } from 'date-fns';
import { UrlTransactionDateFilter } from '@/components/common/url-transaction-date-filter';

// Wrap with withTenant so prisma routes to the correct tenant DB
const getInvoices = withTenant(async (dateRange?: { startDate?: Date; endDate?: Date }) => {
    return PurchaseService.getPurchaseInvoices(dateRange);
});

export default async function PurchaseInvoicesPage({ searchParams }: { searchParams: Promise<{ startDate?: string, endDate?: string, status?: string, overdue?: string }> }) {
    const params = await searchParams;
    const initialStatus = params?.status;
    const overdueMode = params?.overdue === 'true';

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
                    <h1 className="text-3xl font-bold tracking-tight">Invoice Purchase{overdueMode ? ' — Jatuh Tempo' : ''}</h1>
                    <p className="text-muted-foreground">
                        {overdueMode
                            ? 'Filter: hanya invoice lewat jatuh tempo (today > dueDate & belum lunas).'
                            : 'Kelola tagihan supplier dan pembayaran. Jatuh tempo = Invoice + Tempo (atau manual).'}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <UrlTransactionDateFilter defaultPreset="all" align="end" />
                </div>
            </div>

            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <PurchaseInvoiceTable invoices={serializedInvoices as any} basePath="/finance/invoices/purchase" initialStatus={initialStatus} overdueMode={overdueMode} />
        </div>
    );
}
