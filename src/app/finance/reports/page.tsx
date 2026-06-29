
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    LayoutDashboard,
    BarChart3,
    ArrowRight,
    Activity,
    PieChart,
    Scale,
    Factory,
    BookOpen
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
        bg: "bg-blue-500/10 dark:bg-blue-400/10"
    },
    {
        title: reportLabels.incomeStatement,
        description: reportLabels.incomeStatementDesc,
        href: "/finance/reports/income-statement",
        icon: BarChart3,
        color: "text-emerald-500 dark:text-emerald-400",
        bg: "bg-emerald-500/10 dark:bg-emerald-400/10"
    },
    {
        title: reportLabels.trialBalance,
        description: reportLabels.trialBalanceDesc,
        href: "/finance/reports/trial-balance",
        icon: Activity,
        color: "text-amber-500 dark:text-amber-400",
        bg: "bg-amber-500/10 dark:bg-amber-400/10"
    },
    {
        title: reportLabels.generalLedger,
        description: reportLabels.generalLedgerDesc,
        href: "/finance/reports/general-ledger",
        icon: BookOpen,
        color: "text-blue-600 dark:text-blue-400",
        bg: "bg-blue-600/10 dark:bg-blue-400/10"
    },
    {
        title: reportLabels.budgetVariance,
        description: reportLabels.budgetVarianceDesc,
        href: "/finance/reports/budget-variance",
        icon: PieChart,
        color: "text-purple-500 dark:text-purple-400",
        bg: "bg-purple-500/10 dark:bg-purple-400/10"
    },
    {
        title: reportLabels.cashFlowStatement,
        description: reportLabels.cashFlowStatementDesc,
        href: "/finance/reports/cash-flow",
        icon: Activity,
        color: "text-emerald-600 dark:text-emerald-400",
        bg: "bg-emerald-600/10 dark:bg-emerald-400/10"
    },
    {
        title: reportLabels.taxReport,
        description: reportLabels.taxReportDesc,
        href: "/finance/reports/tax",
        icon: Scale,
        color: "text-amber-600 dark:text-amber-400",
        bg: "bg-amber-600/10 dark:bg-amber-400/10"
    },
    {
        title: reportLabels.maklonProfitability,
        description: reportLabels.maklonProfitabilityDesc,
        href: "/finance/reports/maklon",
        icon: Factory,
        color: "text-purple-600 dark:text-purple-400",
        bg: "bg-purple-600/10 dark:bg-purple-400/10"
    }
];

export default function ReportsPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">{reportLabels.financialReports}</h1>
                <p className="text-muted-foreground">
                    {reportLabels.comprehensiveReports}
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
                {reports.map((report) => (
                    <Card key={report.title} className="hover:shadow-md transition-shadow">
                        <CardHeader className="flex flex-row items-center gap-4 pb-2">
                            <div className={`p-2 rounded-lg ${report.bg}`}>
                                <report.icon className={`h-6 w-6 ${report.color}`} />
                            </div>
                            <div className="flex-1">
                                <CardTitle className="text-xl">{report.title}</CardTitle>
                                <CardDescription>{report.title === reportLabels.incomeStatement ? reportLabels.plStatement : reportLabels.accountingReport}</CardDescription>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground mb-4">
                                {report.description}
                            </p>
                            <Link href={report.href}>
                                <Button className="w-full group">
                                    {reportLabels.viewReport}
                                    <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                                </Button>
                            </Link>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Card className="bg-slate-900 dark:bg-slate-800 text-white border-0 overflow-hidden relative">
                <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-indigo-500/20 to-transparent pointer-events-none" />
                <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                        <LayoutDashboard className="h-5 w-5 text-indigo-400 dark:text-indigo-300" />
                        {reportLabels.customAnalysis}
                    </CardTitle>
                    <CardDescription className="text-slate-400 dark:text-slate-300">
                        {reportLabels.customAnalysisDesc}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <Button variant="secondary" className="font-bold">
                            {reportLabels.openReportBuilder}
                        </Button>
                        <Button variant="outline" className="border-slate-700 dark:border-slate-600 text-white hover:bg-slate-800 dark:hover:bg-slate-700">
                            {reportLabels.downloadRawData}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
