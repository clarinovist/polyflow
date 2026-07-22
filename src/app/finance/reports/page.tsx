
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import Link from "next/link";
import { reportLabels } from "@/lib/labels";

const reports = [
    {
        title: reportLabels.balanceSheet,
        description: reportLabels.balanceSheetDesc,
        href: "/finance/reports/balance-sheet",
        icon: Scale,
        color: "text-blue-500 dark:text-blue-400",
        bg: "bg-blue-500/10 dark:bg-blue-400/10",
        badge: "Neraca",
    },
    {
        title: reportLabels.incomeStatement,
        description: reportLabels.incomeStatementDesc,
        href: "/finance/reports/income-statement",
        icon: BarChart3,
        color: "text-emerald-500 dark:text-emerald-400",
        bg: "bg-emerald-500/10 dark:bg-emerald-400/10",
        badge: "Laba Rugi",
    },
    {
        title: reportLabels.trialBalance,
        description: reportLabels.trialBalanceDesc,
        href: "/finance/reports/trial-balance",
        icon: Activity,
        color: "text-amber-500 dark:text-amber-400",
        bg: "bg-amber-500/10 dark:bg-amber-400/10",
        badge: "Saldo",
    },
    {
        title: reportLabels.generalLedger,
        description: reportLabels.generalLedgerDesc,
        href: "/finance/reports/general-ledger",
        icon: BookOpen,
        color: "text-blue-600 dark:text-blue-400",
        bg: "bg-blue-600/10 dark:bg-blue-400/10",
        badge: "Transaksi",
    },
    {
        title: reportLabels.cashFlowStatement,
        description: reportLabels.cashFlowStatementDesc,
        href: "/finance/reports/cash-flow",
        icon: Activity,
        color: "text-emerald-600 dark:text-emerald-400",
        bg: "bg-emerald-600/10 dark:bg-emerald-400/10",
        badge: "Kas",
    },
    {
        title: "Laporan HPP (COGM)",
        description: "HPP produksi manufaktur: bahan baku, tenaga kerja langsung, FOH. Filter periode & posting.",
        href: "/finance/reports/hpp",
        icon: Factory,
        color: "text-slate-600 dark:text-slate-300",
        bg: "bg-slate-500/10 dark:bg-slate-400/10",
        badge: "Produksi",
    },
    {
        title: reportLabels.taxReport,
        description: reportLabels.taxReportDesc,
        href: "/finance/reports/tax",
        icon: Receipt,
        color: "text-amber-600 dark:text-amber-400",
        bg: "bg-amber-600/10 dark:bg-amber-400/10",
        badge: "Pajak",
    },
    {
        title: reportLabels.maklonProfitability,
        description: reportLabels.maklonProfitabilityDesc,
        href: "/finance/reports/maklon",
        icon: Factory,
        color: "text-purple-600 dark:text-purple-400",
        bg: "bg-purple-600/10 dark:bg-purple-400/10",
        badge: "Maklon",
    },
    {
        title: reportLabels.budgetVariance,
        description: reportLabels.budgetVarianceDesc,
        href: "/finance/budgeting/variance",
        icon: PieChart,
        color: "text-purple-500 dark:text-purple-400",
        bg: "bg-purple-500/10 dark:bg-purple-400/10",
        badge: "Anggaran",
    },
];

export default function ReportsPage() {
    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Laporan Keuangan</h1>
                <p className="text-muted-foreground">
                    Pusat laporan: neraca, laba rugi, arus kas, buku besar, HPP, pajak, maklon, anggaran. Semua baca GL POSTED. Gunakan papan keuangan untuk antrean kerja harian (piutang/hutang/jurnal).
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                    <Badge variant="outline" className="text-[11px]">8 laporan + 1 anggaran</Badge>
                    <Badge variant="outline" className="text-[11px]">Sidebar = 1 hub (target IA)</Badge>
                    <Badge variant="outline" className="text-[11px]"><Wallet className="h-3 w-3 mr-1 inline" /> GL = periode · invoice = sisa snapshot</Badge>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
                {reports.map((report) => (
                    <Card key={report.href} className="hover:shadow-md transition-shadow flex flex-col">
                        <CardHeader className="flex flex-row items-center gap-3 pb-2">
                            <div className={`p-2.5 rounded-lg shrink-0 ${report.bg}`}>
                                <report.icon className={`h-5 w-5 ${report.color}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <CardTitle className="text-base truncate">{report.title}</CardTitle>
                                    <Badge variant="secondary" className="text-[9px] h-4 px-1.5">{report.badge}</Badge>
                                </div>
                                <CardDescription className="text-[11px] line-clamp-1">{report.title === reportLabels.incomeStatement ? reportLabels.plStatement : reportLabels.accountingReport}</CardDescription>
                            </div>
                        </CardHeader>
                        <CardContent className="flex flex-col flex-1">
                            <p className="text-xs text-muted-foreground mb-4 line-clamp-2 flex-1">
                                {report.description}
                            </p>
                            <Link href={report.href} className="mt-auto">
                                <Button size="sm" className="w-full group">
                                    {reportLabels.viewReport}
                                    <ArrowRight className="ml-2 h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                                </Button>
                            </Link>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" /> Quick entry</CardTitle>
                    </CardHeader>
                    <CardContent className="flex gap-2">
                        <Link href="/finance/quick-entry" className="flex-1"><Button variant="outline" size="sm" className="w-full">Quick entry kas</Button></Link>
                        <Link href="/finance/aging" className="flex-1"><Button variant="outline" size="sm" className="w-full">Aging AR/AP</Button></Link>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Papan</CardTitle>
                    </CardHeader>
                    <CardContent className="flex gap-2">
                        <Link href="/finance" className="flex-1"><Button variant="outline" size="sm" className="w-full">→ Papan Keuangan</Button></Link>
                        <Link href="/finance/budgeting" className="flex-1"><Button variant="outline" size="sm" className="w-full">→ Anggaran</Button></Link>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2"><BookOpen className="h-4 w-4" /> Jurnal</CardTitle>
                    </CardHeader>
                    <CardContent className="flex gap-2">
                        <Link href="/finance/journals" className="flex-1"><Button variant="outline" size="sm" className="w-full">Jurnal</Button></Link>
                        <Link href="/finance/coa" className="flex-1"><Button variant="outline" size="sm" className="w-full">COA</Button></Link>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-dashed">
                <CardHeader>
                    <CardTitle className="text-sm">Catatan metrik (anti-bingung)</CardTitle>
                    <CardDescription className="text-xs">
                        Laporan = GL POSTED filter periode (akun 4* = pendapatan, 111* = kas, 112* = piutang GL, 211* = hutang GL). Antrean di papan = invoice.belum lunas snapshot (total - paid, filter dueDate &lt; hari ini untuk overdue), bukan = GL. Jangan campur di UAT.
                    </CardDescription>
                </CardHeader>
            </Card>
        </div>
    );
}

