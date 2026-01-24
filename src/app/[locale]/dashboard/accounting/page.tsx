
import { getAccountingDashboardData } from '@/actions/accounting';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatRupiah } from '@/lib/utils';
import {
    TrendingUp,
    TrendingDown,
    Wallet,
    ArrowUpRight,
    ArrowDownRight,
    History,
    RefreshCw
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface RecentJournal {
    id: string;
    entryNumber: string;
    entryDate: string | Date;
    description: string;
}

export default async function AccountingDashboardPage() {
    const data = await getAccountingDashboardData();

    const kpis = [
        {
            title: "MTD Revenue",
            value: data.performance.revenue,
            icon: ArrowUpRight,
            color: "text-green-600",
            description: "Total revenue this month"
        },
        {
            title: "MTD Expenses",
            value: data.performance.expense,
            icon: ArrowDownRight,
            color: "text-red-600",
            description: "Total operating expenses"
        },
        {
            title: "Net Income",
            value: data.performance.netIncome,
            icon: data.performance.netIncome >= 0 ? TrendingUp : TrendingDown,
            color: data.performance.netIncome >= 0 ? "text-blue-600" : "text-red-600",
            description: "Net profit after expenses"
        },
        {
            title: "Cash on Hand",
            value: data.balances.cash,
            icon: Wallet,
            color: "text-emerald-600",
            description: "Total liquid cash & bank"
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Accounting Dashboard</h1>
                    <p className="text-muted-foreground">
                        Financial health overview and recent activity.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm">
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Refresh
                    </Button>
                    <Link href="/dashboard/accounting/journals/create">
                        <Button size="sm">New Journal</Button>
                    </Link>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {kpis.map((kpi) => (
                    <Card key={kpi.title}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">{kpi.title}</CardTitle>
                            <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold tracking-tighter">{formatRupiah(kpi.value)}</div>
                            <p className="text-xs text-muted-foreground mt-1">{kpi.description}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                {/* Working Capital Overview */}
                <Card className="col-span-3">
                    <CardHeader>
                        <CardTitle>Working Capital</CardTitle>
                        <CardDescription>Accounts Receivable vs Payable</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">Accounts Receivable (AR)</span>
                                <span className="font-medium text-green-600 font-mono">{formatRupiah(data.balances.ar)}</span>
                            </div>
                            <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                                <div
                                    className="bg-green-500 h-full transition-all"
                                    style={{ width: `${Math.min(100, (data.balances.ar / (data.balances.ar + data.balances.ap || 1)) * 100)}%` }}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">Accounts Payable (AP)</span>
                                <span className="font-medium text-red-600 font-mono">{formatRupiah(data.balances.ap)}</span>
                            </div>
                            <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                                <div
                                    className="bg-red-500 h-full transition-all"
                                    style={{ width: `${Math.min(100, (data.balances.ap / (data.balances.ar + data.balances.ap || 1)) * 100)}%` }}
                                />
                            </div>
                        </div>
                        <div className="pt-4 border-t">
                            <div className="flex justify-between items-end">
                                <div>
                                    <p className="text-xs text-muted-foreground uppercase font-semibold">Net Working Capital</p>
                                    <p className="text-xl font-bold font-mono">{formatRupiah(data.balances.ar - data.balances.ap)}</p>
                                </div>
                                <Link href="/dashboard/accounting/reports">
                                    <Button variant="ghost" size="sm" className="h-8 text-xs underline">Full Aging Report</Button>
                                </Link>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Recent Journals */}
                <Card className="col-span-4">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle>Recent Journals</CardTitle>
                            <CardDescription>Latest posted transactions in the GL</CardDescription>
                        </div>
                        <History className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Number</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Reference</TableHead>
                                    <TableHead className="text-right">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.recentJournals.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center h-16 text-muted-foreground">No recent journals.</TableCell>
                                    </TableRow>
                                ) : (
                                    data.recentJournals.map((je: RecentJournal) => (
                                        <TableRow key={je.id}>
                                            <TableCell className="font-mono text-xs font-bold">{je.entryNumber}</TableCell>
                                            <TableCell className="text-xs">{new Date(je.entryDate).toLocaleDateString()}</TableCell>
                                            <TableCell className="max-w-[150px] truncate text-xs">{je.description}</TableCell>
                                            <TableCell className="text-right">
                                                <Link href={`/dashboard/accounting/journals/${je.id}`}>
                                                    <Button variant="ghost" size="sm" className="h-7 text-xs">View</Button>
                                                </Link>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
