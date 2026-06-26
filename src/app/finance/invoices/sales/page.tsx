
import { getInvoices } from "@/actions/finance/invoice";
import { InvoiceTable } from "@/components/sales/InvoiceTable";

import { serializeData } from "@/lib/utils/utils";
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import { parseISO } from 'date-fns';
import { UrlTransactionDateFilter } from '@/components/common/url-transaction-date-filter';

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ startDate?: string, endDate?: string, demand?: 'customer' | 'legacy-internal' }> }) {
    const params = await searchParams;
    const demand = params?.demand || 'customer';

    // Only filter by date when explicitly provided via URL params
    const dateRange = params?.startDate && params?.endDate
        ? { startDate: parseISO(params.startDate), endDate: parseISO(params.endDate) }
        : undefined;

    const buildDemandHref = (nextDemand: 'customer' | 'legacy-internal') => {
        const query = new URLSearchParams();
        query.set('demand', nextDemand);
        if (params?.startDate) query.set('startDate', params.startDate);
        if (params?.endDate) query.set('endDate', params.endDate);
        return `/finance/invoices/sales?${query.toString()}`;
    };

    const invoices = await getInvoices(dateRange, demand);

    // Serialize all Prisma objects for Client Components
    const serializedInvoices = invoices.success && invoices.data ? serializeData(invoices.data) : [];

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex flex-col gap-2">
                    <h1 className="text-3xl font-bold tracking-tight">Sales Invoices</h1>
                    <p className="text-muted-foreground">
                        Manage customer billing and track outstanding payments.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <UrlTransactionDateFilter defaultPreset="all" align="end" />
                </div>
            </div>

            <Tabs defaultValue={demand} className="w-full">
                <TabsList className="grid w-full grid-cols-2 md:w-[420px]">
                    <TabsTrigger value="customer" asChild>
                        <Link href={buildDemandHref('customer')}>Customer AR</Link>
                    </TabsTrigger>
                    <TabsTrigger value="legacy-internal" asChild>
                        <Link href={buildDemandHref('legacy-internal')}>Legacy Internal</Link>
                    </TabsTrigger>
                </TabsList>
            </Tabs>

            {demand === 'legacy-internal' && (
                <Alert className="border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20">
                    <AlertTitle>Legacy internal review</AlertTitle>
                    <AlertDescription>
                        This tab is for historical invoices that originated from internal stock build flows before customer enforcement was added. Treat it as cleanup and audit review, not as a normal receivables workflow.
                    </AlertDescription>
                </Alert>
            )}

            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <InvoiceTable invoices={serializedInvoices as any} basePath="/finance/invoices/sales" />
        </div>
    );
}
