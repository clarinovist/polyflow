import { getQuotations } from '@/actions/quotations';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { SalesQuotationTable } from '@/components/sales/quotations/SalesQuotationTable';
import { serializeData } from '@/lib/utils';

import { UrlTransactionDateFilter } from '@/components/ui/url-transaction-date-filter';
import { parseISO, startOfMonth, endOfMonth } from 'date-fns';

export default async function SalesQuotationsPage({ searchParams }: { searchParams: Promise<{ startDate?: string, endDate?: string }> }) {
    const params = await searchParams;
    const now = new Date();
    const defaultStart = startOfMonth(now);
    const defaultEnd = endOfMonth(now);

    const checkStart = params?.startDate ? parseISO(params.startDate) : defaultStart;
    const checkEnd = params?.endDate ? parseISO(params.endDate) : defaultEnd;

    const quotations = await getQuotations({ startDate: checkStart, endDate: checkEnd });

    // Serialize all Prisma objects for Client Components
    const serializedQuotations = serializeData(quotations);

    return (
        <div className="flex flex-col space-y-6 p-6 max-w-7xl mx-auto">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Sales Quotations</h1>
                    <p className="text-muted-foreground">Manage pre-sales quotations and proposals.</p>
                </div>
                <div className="flex items-center gap-2">
                    <UrlTransactionDateFilter defaultPreset="this_month" />
                    <Button asChild>
                        <Link href="/sales/quotations/create">
                            <Plus className="mr-2 h-4 w-4" />
                            New Quotation
                        </Link>
                    </Button>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Recent Quotations</CardTitle>
                </CardHeader>
                <CardContent>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <SalesQuotationTable initialData={serializedQuotations as any} basePath="/sales/quotations" />
                </CardContent>
            </Card>
        </div>
    );
}
