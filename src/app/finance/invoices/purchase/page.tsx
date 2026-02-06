import React from 'react';
import { PurchaseService } from '@/services/purchase-service';
import { PurchaseInvoiceTable } from '@/components/planning/purchasing/PurchaseInvoiceTable';
import { Metadata } from 'next';
import { ShoppingCart } from 'lucide-react';
import { serializeData } from '@/lib/utils';

export const metadata: Metadata = {
    title: 'Purchase Invoices | PolyFlow',
};

export default async function PurchaseInvoicesPage() {
    const invoices = await PurchaseService.getPurchaseInvoices();

    // Serialize all Prisma objects for Client Components
    const serializedInvoices = serializeData(invoices);

    return (
        <div className="flex flex-col gap-6 p-6">
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

            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <PurchaseInvoiceTable invoices={serializedInvoices as any} basePath="/finance/invoices/purchase" />
        </div>
    );
}
