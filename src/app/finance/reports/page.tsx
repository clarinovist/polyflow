import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    BarChart3,
    ArrowRight,
    Activity,
    PieChart,
    Scale,
    Factory,
    BookOpen,
    Receipt,
    Wallet,
    FileText,
} from 'lucide-react';
import Link from 'next/link';
import { reportLabels } from '@/lib/labels';

const reports = [
    {
        title: reportLabels.balanceSheet,
        description: reportLabels.balanceSheetDesc,
        href: '/finance/reports/balance-sheet',
        icon: Scale,
        color: 'text-blue-500 dark:text-blue-400',
        bg: 'bg-blue-500/10 dark:bg-blue-400/10',
        badge: 'Neraca',
    },
    {
        title: reportLabels.incomeStatement,
        description: reportLabels.incomeStatementDesc,
        href: '/finance/reports/income-statement',
        icon: BarChart3,
        color: 'text-emerald-500 dark:text-emerald-400',
        bg: 'bg-emerald-500/10 dark:bg-emerald-400/10',
        badge: 'Laba Rugi',
    },
    {
        title: reportLabels.trialBalance,
        description: reportLabels.trialBalanceDesc,
        href: '/finance/reports/trial-balance',
        icon: Activity,
        color: 'text-amber-500 dark:text-amber-400',
        bg: 'bg-amber-500/10 dark:bg-amber-400/10',
        badge: 'Saldo',
    },
    {
        title: reportLabels.generalLedger,
        description: reportLabels.generalLedgerDesc,
        href: '/finance/reports/general-ledger',
        icon: BookOpen,
        color: 'text-blue-600 dark:text-blue-400',
        bg: 'bg-blue-600/10 dark:bg-blue-400/10',
        badge: 'Transaksi',
    },
    {
        title: reportLabels.cashFlowStatement,
        description: reportLabels.cashFlowStatementDesc,
        href: '/finance/reports/cash-flow',
        icon: Activity,
        color: 'text-emerald-600 dark:text-emerald-400',
        bg: 'bg-emerald-600/10 dark:bg-emerald-400/10',
        badge: 'Kas',
    },
    {
        title: 'Laporan HPP (COGM)',
        description:
            'HPP produksi manufaktur: bahan baku, tenaga kerja langsung, FOH. Filter periode & posting.',
        href: '/finance/reports/hpp',
        icon: Factory,
        color: 'text-slate-600 dark:text-slate-300',
        bg: 'bg-slate-500/10 dark:bg-slate-400/10',
        badge: 'Produksi',
    },
    {
        title: reportLabels.taxReport,
        description: reportLabels.taxReportDesc,
        href: '/finance/reports/tax',
        icon: Receipt,
        color: 'text-amber-600 dark:text-amber-400',
        bg: 'bg-amber-600/10 dark:bg-amber-400/10',
        badge: 'Pajak',
    },
    {
        title: reportLabels.maklonProfitability,
        description: reportLabels.maklonProfitabilityDesc,
        href: '/finance/reports/maklon',
        icon: Factory,
        color: 'text-purple-600 dark:text-purple-400',
        bg: 'bg-purple-600/10 dark:bg-purple-400/10',
        badge: 'Maklon',
    },
    {
        title: reportLabels.budgetVariance,
        description: reportLabels.budgetVarianceDesc,
        href: '/finance/budgeting/variance',
        icon: PieChart,
        color: 'text-purple-500 dark:text-purple-400',
        bg: 'bg-purple-500/10 dark:bg-purple-400/10',
        badge: 'Anggaran',
    },
];

export default function ReportsPage() {
    return (
        <div className="min-w-0 space-y-6 [overflow-wrap:anywhere] [&_[data-slot=card]]:min-w-0 [&_[data-slot=badge]]:whitespace-normal">
            <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
                    Laporan Keuangan
                </h1>
                <p className="text-sm text-muted-foreground">
                    Pusat laporan: neraca, laba rugi, arus kas, buku besar, HPP,
                    pajak, maklon, anggaran. Semua baca GL POSTED. Gunakan papan
                    keuangan untuk antrean kerja harian (piutang/hutang/jurnal).
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                    <Badge variant="outline" className="text-[11px]">
                        8 laporan + 1 anggaran
                    </Badge>
                    <Badge variant="outline" className="text-[11px]">
                        <Wallet className="h-3 w-3 mr-1 inline" /> GL = periode
                        · invoice = sisa snapshot
                    </Badge>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
                {reports.map((report) => (
                    <Card
                        key={report.href}
                        className="flex min-w-0 flex-col gap-3 shadow-sm"
                    >
                        <CardHeader className="flex flex-row items-center gap-3 pb-2">
                            <div
                                className={`p-2.5 rounded-lg shrink-0 ${report.bg}`}
                            >
                                <report.icon
                                    className={`h-5 w-5 ${report.color}`}
                                />
                            </div>
                            <div className="flex-1 min-w-0">
                                <CardTitle className="text-base [overflow-wrap:anywhere]">
                                    {report.title}
                                </CardTitle>
                                <CardDescription className="mt-1 text-xs">
                                    {report.title ===
                                    reportLabels.incomeStatement
                                        ? reportLabels.plStatement
                                        : reportLabels.accountingReport}
                                </CardDescription>
                            </div>
                        </CardHeader>
                        <CardContent className="flex flex-col flex-1">
                            <p className="mb-3 flex-1 text-sm text-muted-foreground">
                                {report.description}
                            </p>
                            <Button
                                asChild
                                variant="outline"
                                className="mt-auto min-h-11 w-full"
                            >
                                <Link
                                    href={report.href}
                                    aria-label={`${reportLabels.viewReport}: ${report.title}`}
                                >
                                    {reportLabels.viewReport}
                                    <ArrowRight className="ml-2 h-4 w-4" />
                                </Link>
                            </Button>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="grid gap-4 xl:grid-cols-3 [&_[data-slot=card-content]]:flex-wrap [&_a]:min-w-0 [&_button]:h-auto [&_button]:min-h-11 [&_button]:whitespace-normal">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <FileText className="h-4 w-4" /> Quick entry
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex gap-2">
                        <Link href="/finance/quick-entry" className="flex-1">
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full"
                            >
                                Quick entry kas
                            </Button>
                        </Link>
                        <Link href="/finance/aging" className="flex-1">
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full"
                            >
                                Aging AR/AP
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <BarChart3 className="h-4 w-4" /> Papan
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex gap-2">
                        <Link href="/finance" className="flex-1">
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full"
                            >
                                → Papan Keuangan
                            </Button>
                        </Link>
                        <Link href="/finance/budgeting" className="flex-1">
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full"
                            >
                                → Anggaran
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <BookOpen className="h-4 w-4" /> Jurnal
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex gap-2">
                        <Link href="/finance/journals" className="flex-1">
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full"
                            >
                                Jurnal
                            </Button>
                        </Link>
                        <Link href="/finance/coa" className="flex-1">
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full"
                            >
                                COA
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-dashed">
                <CardHeader>
                    <CardTitle className="text-sm">
                        Catatan metrik (anti-bingung)
                    </CardTitle>
                    <CardDescription className="text-xs">
                        Laporan = GL POSTED filter periode (akun 4* =
                        pendapatan, 111* = kas, 112* = piutang GL, 211* = hutang
                        GL). Antrean di papan = invoice.belum lunas snapshot
                        (total - paid, filter dueDate &lt; hari ini untuk
                        overdue), bukan = GL. Jangan campur di UAT.
                    </CardDescription>
                </CardHeader>
            </Card>
        </div>
    );
}
