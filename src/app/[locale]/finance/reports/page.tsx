
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { ArrowRight, FileText, Scale, Landmark } from "lucide-react";

export default function AccountingReportsPage() {
    const reports = [
        {
            title: "Trial Balance",
            description: "View the balance of all accounts to ensure debits equal credits.",
            href: "/finance/reports/trial-balance",
            icon: Scale,
            color: "text-blue-500"
        },
        {
            title: "Income Statement",
            description: "Analyze revenue, expenses, and net profit over a specific period.",
            href: "/finance/reports/income-statement",
            icon: FileText,
            color: "text-green-500"
        },
        {
            title: "Balance Sheet",
            description: "Snapshot of company's financial position: Assets, Liabilities, and Equity.",
            href: "/finance/reports/balance-sheet",
            icon: Landmark,
            color: "text-purple-500"
        }
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Financial Reports</h1>
                <p className="text-muted-foreground">
                    Access standard accounting reports to analyze business performance.
                </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {reports.map((report) => (
                    <Card key={report.href} className="hover:bg-muted/50 transition-colors">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <report.icon className={`h-8 w-8 ${report.color}`} />
                            </div>
                            <CardTitle className="mt-4">{report.title}</CardTitle>
                            <CardDescription>{report.description}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button asChild className="w-full" variant="outline">
                                <Link href={report.href}>
                                    View Report <ArrowRight className="ml-2 h-4 w-4" />
                                </Link>
                            </Button>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
