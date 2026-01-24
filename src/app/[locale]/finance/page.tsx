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

export const dynamic = 'force-dynamic';

export default async function FinanceDashboardPage() {
    const stats = await getFinanceDashboardStats();

    return (
        <div className="flex flex-col gap-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Finance Overview</h1>
                <p className="text-muted-foreground mt-1">
                    Real-time financial snapshot and cash flow analysis.
                </p>
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

                <Card className="bg-slate-900 text-white">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-white">
                            <TrendingUp className="h-5 w-5" />
                            Financial Reports
                        </CardTitle>
                        <CardDescription className="text-slate-400">Deep dive into your ledger</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <Link href="/finance/reports">
                            <Button variant="secondary" className="w-full justify-start h-12 font-bold text-slate-900">
                                Profit & Loss Statement
                            </Button>
                        </Link>
                        <div className="grid grid-cols-2 gap-2">
                            <Link href="/finance/journals">
                                <Button variant="outline" className="w-full border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white">
                                    Journals
                                </Button>
                            </Link>
                            <Link href="/finance/costing">
                                <Button variant="outline" className="w-full border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white">
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
