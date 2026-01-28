
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    LayoutDashboard,
    BarChart3,
    ArrowRight,
    Activity,
    PieChart,
    Scale
} from "lucide-react";
import Link from "next/link";

const reports = [
    {
        title: "Balance Sheet",
        description: "A summary of assets, liabilities, and equity at a specific point in time.",
        href: "/finance/reports/balance-sheet",
        icon: Scale,
        color: "text-blue-500",
        bg: "bg-blue-500/10"
    },
    {
        title: "Income Statement",
        description: "Profit and Loss statement showing revenues and expenses over a period.",
        href: "/finance/reports/income-statement",
        icon: BarChart3,
        color: "text-emerald-500",
        bg: "bg-emerald-500/10"
    },
    {
        title: "Trial Balance",
        description: "Listing of all general ledger accounts and their current balances.",
        href: "/finance/reports/trial-balance",
        icon: Activity,
        color: "text-amber-500",
        bg: "bg-amber-500/10"
    },
    {
        title: "Budget Variance",
        description: "Comparison of actual performance against budgeted targets.",
        href: "/finance/reports/budget-variance",
        icon: PieChart,
        color: "text-purple-500",
        bg: "bg-purple-500/10"
    }
];

export default function ReportsPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Financial Reports</h1>
                <p className="text-muted-foreground">
                    Comprehensive accounting statements and analysis tools.
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
                                <CardDescription>{report.title === "Income Statement" ? "P&L Statement" : "Accounting Report"}</CardDescription>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground mb-4">
                                {report.description}
                            </p>
                            <Link href={report.href}>
                                <Button className="w-full group">
                                    View Report
                                    <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                                </Button>
                            </Link>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Card className="bg-slate-900 text-white border-0 overflow-hidden relative">
                <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-indigo-500/20 to-transparent pointer-events-none" />
                <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                        <LayoutDashboard className="h-5 w-5 text-indigo-400" />
                        Custom Analysis
                    </CardTitle>
                    <CardDescription className="text-slate-400">
                        Need a specialized report or custom data export?
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <Button variant="secondary" className="font-bold">
                            Open Report Builder
                        </Button>
                        <Button variant="outline" className="border-slate-700 text-white hover:bg-slate-800">
                            Download Raw Data (CSV)
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
