
import { getInvoices } from "@/actions/invoice";
import { InvoiceTable } from "@/components/sales/InvoiceTable";
import { Receipt } from "lucide-react";
import { serializeData } from "@/lib/utils";

import { startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { UrlTransactionDateFilter } from '@/components/ui/url-transaction-date-filter';

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ startDate?: string, endDate?: string }> }) {
    const params = await searchParams;
    const now = new Date();
    const defaultStart = startOfMonth(now);
    const defaultEnd = endOfMonth(now);

    const checkStart = params?.startDate ? parseISO(params.startDate) : defaultStart;
    const checkEnd = params?.endDate ? parseISO(params.endDate) : defaultEnd;

    const invoices = await getInvoices({ startDate: checkStart, endDate: checkEnd });

    // Serialize all Prisma objects for Client Components
    const serializedInvoices = serializeData(invoices);

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                        <Receipt className="h-3 w-3" />
                        <span>Receivables / Invoices</span>
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight">Sales Invoices</h1>
                    <p className="text-muted-foreground">
                        Manage customer billing and track outstanding payments.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <UrlTransactionDateFilter defaultPreset="this_month" align="end" />
                </div>
            </div>

            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <InvoiceTable invoices={serializedInvoices as any} basePath="/finance/invoices/sales" />
        </div>
    );
}
