import { getFinanceDashboardStats } from '@/actions/finance-dashboard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { formatRupiah } from '@/lib/utils';
import {
    Wallet,
    ArrowUpRight,
    ArrowDownRight,
    TrendingUp,
    FileText,
    DollarSign,
    Briefcase
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

import { PageHeader } from '@/components/ui/page-header';

import { startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { FinanceDateFilter } from '@/components/finance/finance-date-filter';

export const dynamic = 'force-dynamic';

export default async function FinanceDashboardPage({ searchParams }: { searchParams: Promise<{ startDate?: string, endDate?: string }> }) {
    const params = await searchParams;
    const now = new Date();
    const defaultStart = startOfMonth(now);
    const defaultEnd = endOfMonth(now);

    const checkStart = params?.startDate ? parseISO(params.startDate) : defaultStart;
    const checkEnd = params?.endDate ? parseISO(params.endDate) : defaultEnd;

    const stats = await getFinanceDashboardStats({ startDate: checkStart, endDate: checkEnd });

    return (
        <div className="flex flex-col gap-8">
            <div className="flex items-center justify-between">
                <PageHeader
                    title="Finance Overview"
                    description="Real-time financial snapshot and cash flow analysis."
                />
                <FinanceDateFilter />
            </div>

            {/* Core Stats */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="border-t-4 border-t-emerald-500 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                        <DollarSign className="h-4 w-4 text-emerald-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatRupiah(stats.revenue)}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Collected from paid invoices
                        </p>
                    </CardContent>
                </Card>
                <Card className="border-t-4 border-t-blue-500 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Net Position</CardTitle>
                        <Wallet className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-600">
                            {formatRupiah(stats.netCashPosition)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Revenue - Total Payables
                        </p>
                    </CardContent>
                </Card>
                <Card className="border-t-4 border-t-amber-500 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Receivables (AR)</CardTitle>
                        <ArrowUpRight className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatRupiah(stats.receivables)}</div>
                        <div className="flex items-center gap-2 mt-1">
                            <Badge variant="secondary" className="text-xs font-normal">
                                {stats.counts.receivables} Unpaid Invoices
                            </Badge>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-t-4 border-t-purple-500 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Payables (AP)</CardTitle>
                        <ArrowDownRight className="h-4 w-4 text-purple-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatRupiah(stats.payables)}</div>
                        <div className="flex items-center gap-2 mt-1">
                            <Badge variant="secondary" className="text-xs font-normal">
                                {stats.counts.payables} Pending Bills
                            </Badge>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Quick Actions */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <FileText className="h-5 w-5 text-indigo-500" />
                            Invoicing
                        </CardTitle>
                        <CardDescription>Manage customer invoices and payments</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <Link href="/finance/invoices/sales">
                            <Button variant="outline" className="w-full justify-start h-12 text-left">
                                <div className="flex flex-col items-start">
                                    <span className="font-semibold">Sales Invoices</span>
                                    <span className="text-[10px] text-muted-foreground">Create and track invoices</span>
                                </div>
                            </Button>
                        </Link>
                        <Link href="/finance/payments/received">
                            <Button variant="ghost" className="w-full justify-between">
                                Check Received Payments <ArrowUpRight className="h-4 w-4 ml-2" />
                            </Button>
                        </Link>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Briefcase className="h-5 w-5 text-rose-500" />
                            Payables
                        </CardTitle>
                        <CardDescription>Bill payments and supplier management</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <Link href="/finance/invoices/purchase">
                            <Button variant="outline" className="w-full justify-start h-12 text-left">
                                <div className="flex flex-col items-start">
                                    <span className="font-semibold">Purchase Invoices</span>
                                    <span className="text-[10px] text-muted-foreground">Process supplier bills</span>
                                </div>
                            </Button>
                        </Link>
                        <Link href="/finance/payments/sent">
                            <Button variant="ghost" className="w-full justify-between">
                                Payment History <ArrowDownRight className="h-4 w-4 ml-2" />
                            </Button>
                        </Link>
                    </CardContent>
                </Card>

                <Card className="relative overflow-hidden border-none shadow-md bg-indigo-600 dark:bg-indigo-900 text-white flex flex-col h-full">
                    {/* Decorative Background Element */}
                    <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
                    <div className="absolute bottom-0 left-0 -mb-8 -ml-8 h-32 w-32 rounded-full bg-indigo-400/20 blur-3xl text-white" />

                    <CardHeader className="relative z-10 pb-2">
                        <CardTitle className="flex items-center gap-2 text-white">
                            <TrendingUp className="h-5 w-5" />
                            Financial Reports
                        </CardTitle>
                        <CardDescription className="text-indigo-100/70">Analyze your financial performance</CardDescription>
                    </CardHeader>

                    <CardContent className="relative z-10 space-y-3 flex-1">
                        <div className="grid grid-cols-1 gap-2">
                            <Link href="/finance/reports/income-statement">
                                <Button variant="secondary" className="w-full justify-between h-11 font-semibold bg-white text-indigo-700 hover:bg-indigo-50 border-none transition-all group">
                                    Profit & Loss
                                    <ArrowUpRight className="h-4 w-4 opacity-70 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                                </Button>
                            </Link>
                            <Link href="/finance/reports/balance-sheet">
                                <Button variant="secondary" className="w-full justify-between h-11 font-semibold bg-white/20 hover:bg-white/30 text-white border-none transition-all group">
                                    Balance Sheet
                                    <ArrowUpRight className="h-4 w-4 opacity-70 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                                </Button>
                            </Link>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-1">
                            <Link href="/finance/journals">
                                <Button variant="ghost" className="w-full h-10 bg-indigo-500/20 hover:bg-indigo-500/40 text-white border-none text-xs font-medium">
                                    Journals
                                </Button>
                            </Link>
                            <Link href="/finance/costing">
                                <Button variant="ghost" className="w-full h-10 bg-indigo-500/20 hover:bg-indigo-500/40 text-white border-none text-xs font-medium">
                                    Costing
                                </Button>
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
