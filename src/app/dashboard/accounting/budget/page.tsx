
import { getBudgets, getChartOfAccounts, getBudgetVariance } from '@/actions/accounting';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BudgetFormDialog } from './budget-form-dialog';
import { formatRupiah } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface BudgetItem {
    id: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    amount: any;
    updatedAt: string | Date;
    account: {
        name: string;
        code: string;
    };
}

interface VarianceItem {
    accountCode: string;
    accountName: string;
    budget: number;
    actual: number;
    variance: number;
    variancePercent: number;
}

export default async function BudgetPage({
    searchParams,
}: {
    searchParams: Promise<{ year?: string; month?: string }>;
}) {
    const params = await searchParams;
    const year = parseInt(params.year || new Date().getFullYear().toString());
    const month = parseInt(params.month || (new Date().getMonth() + 1).toString());

    const [budgets, accounts, variance] = await Promise.all([
        getBudgets(year, month),
        getChartOfAccounts(),
        getBudgetVariance(year, month)
    ]);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Budgeting</h1>
                    <p className="text-muted-foreground">
                        Set financial targets and track variances.
                    </p>
                </div>
                <BudgetFormDialog accounts={accounts} currentYear={year} currentMonth={month} />
            </div>

            <Tabs defaultValue="targets" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="targets">Budget Targets</TabsTrigger>
                    <TabsTrigger value="variance">Variance Analysis</TabsTrigger>
                </TabsList>

                <TabsContent value="targets">
                    <Card>
                        <CardHeader>
                            <CardTitle>Targets for {new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Account</TableHead>
                                        <TableHead className="text-right">Budgeted Amount</TableHead>
                                        <TableHead className="text-right">Last Updated</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {budgets.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={3} className="text-center h-24 text-muted-foreground">
                                                No budget targets set for this period.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        budgets.map((b: BudgetItem) => (
                                            <TableRow key={b.id}>
                                                <TableCell>
                                                    <div className="font-medium">{b.account.name}</div>
                                                    <div className="text-xs text-muted-foreground font-mono">{b.account.code}</div>
                                                </TableCell>
                                                <TableCell className="text-right font-bold">{formatRupiah(Number(b.amount))}</TableCell>
                                                <TableCell className="text-right text-xs text-muted-foreground">
                                                    {new Date(b.updatedAt).toLocaleDateString()}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="variance">
                    <Card>
                        <CardHeader>
                            <CardTitle>Budget vs Actual</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Account</TableHead>
                                        <TableHead className="text-right">Budget</TableHead>
                                        <TableHead className="text-right">Actual</TableHead>
                                        <TableHead className="text-right">Variance</TableHead>
                                        <TableHead className="text-right">%</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {variance.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">
                                                No variance data available.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        variance.map((v: VarianceItem) => (
                                            <TableRow key={v.accountCode}>
                                                <TableCell>
                                                    <div className="font-medium">{v.accountName}</div>
                                                    <div className="text-xs text-muted-foreground font-mono">{v.accountCode}</div>
                                                </TableCell>
                                                <TableCell className="text-right">{formatRupiah(v.budget)}</TableCell>
                                                <TableCell className="text-right font-medium">{formatRupiah(v.actual)}</TableCell>
                                                <TableCell className={cn(
                                                    "text-right font-bold",
                                                    v.variance > 0 ? "text-red-600" : "text-green-600"
                                                )}>
                                                    {v.variance > 0 ? '+' : ''}{formatRupiah(v.variance)}
                                                </TableCell>
                                                <TableCell className={cn(
                                                    "text-right text-xs",
                                                    v.variancePercent > 0 ? "text-red-500" : "text-green-500"
                                                )}>
                                                    {v.variancePercent.toFixed(1)}%
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
