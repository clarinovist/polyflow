import { getSalesInvoices, getInvoiceStats } from '@/actions/invoices';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { InvoiceTable } from '@/components/sales/InvoiceTable';
import { formatRupiah, serializeData } from '@/lib/utils';
import { BadgeDollarSign, AlertCircle } from 'lucide-react';
import { UrlTransactionDateFilter } from '@/components/ui/url-transaction-date-filter';
import { parseISO, startOfMonth, endOfMonth } from 'date-fns';

export default async function SalesInvoicesPage({ searchParams }: { searchParams: Promise<{ startDate?: string, endDate?: string }> }) {
    const params = await searchParams;
    const now = new Date();
    const defaultStart = startOfMonth(now);
    const defaultEnd = endOfMonth(now);

    const checkStart = params?.startDate ? parseISO(params.startDate) : defaultStart;
    const checkEnd = params?.endDate ? parseISO(params.endDate) : defaultEnd;

    const invoices = await getSalesInvoices({ startDate: checkStart, endDate: checkEnd });
    const stats = await getInvoiceStats();
    const serializedInvoices = serializeData(invoices);

    return (
        <div className="flex flex-col space-y-6 p-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Sales Invoices</h1>
                    <p className="text-muted-foreground">Manage invoices and track payments.</p>
                </div>
                <div className="flex items-center gap-2">
                    <UrlTransactionDateFilter defaultPreset="this_month" align="end" />
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Outstanding Amount
                        </CardTitle>
                        <BadgeDollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatRupiah(stats.totalOutstanding)}</div>
                        <p className="text-xs text-muted-foreground">
                            Unpaid or partial invoices
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Overdue Invoices
                        </CardTitle>
                        <AlertCircle className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">{stats.overdueCount}</div>
                        <p className="text-xs text-muted-foreground">
                            Requires immediate attention
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>All Invoices</CardTitle>
                    <CardDescription>
                        List of all sales invoices generated.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <InvoiceTable invoices={serializedInvoices as any} />
                </CardContent>
            </Card>
        </div>
    );
}
