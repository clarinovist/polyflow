import { getQuotations } from '@/actions/sales/quotations';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { SalesQuotationTable } from '@/components/sales/quotations/SalesQuotationTable';
import { serializeData } from '@/lib/utils/utils';
import { salesLabels } from '@/lib/labels';

import { UrlTransactionDateFilter } from '@/components/common/url-transaction-date-filter';
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
    const serializedQuotations = quotations.success && quotations.data ? serializeData(quotations.data) : [];

    return (
        <div className="flex flex-col space-y-6 p-6 max-w-7xl mx-auto">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{salesLabels.salesQuotations}</h1>
                    <p className="text-muted-foreground">{salesLabels.salesQuotationsDesc}</p>
                </div>
                <div className="flex items-center gap-2">
                    <UrlTransactionDateFilter defaultPreset="this_month" />
                    <Button asChild>
                        <Link href="/sales/quotations/create">
                            <Plus className="mr-2 h-4 w-4" />
                            {salesLabels.newQuotation}
                        </Link>
                    </Button>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>{salesLabels.recentQuotations}</CardTitle>
                </CardHeader>
                <CardContent>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <SalesQuotationTable initialData={serializedQuotations as any} basePath="/sales/quotations" />
                </CardContent>
            </Card>
        </div>
    );
}
