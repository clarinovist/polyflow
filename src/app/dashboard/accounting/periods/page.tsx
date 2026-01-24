
import { getFiscalPeriods } from '@/actions/accounting';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Lock, Unlock } from 'lucide-react';
import { PeriodFormDialog } from './period-form-dialog';
import { ClosePeriodButton } from './close-period-button';

interface FiscalPeriod {
    id: string;
    name: string;
    year: number;
    month: number;
    startDate: string | Date;
    endDate: string | Date;
    status: string;
}

export default async function FiscalPeriodsPage() {
    const periods = await getFiscalPeriods();

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Fiscal Periods</h1>
                    <p className="text-muted-foreground">
                        Manage financial reporting periods and lock transactions.
                    </p>
                </div>
                <PeriodFormDialog />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Accounting Calendar</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Period Name</TableHead>
                                <TableHead>Year</TableHead>
                                <TableHead>Month</TableHead>
                                <TableHead>Date Range</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {periods.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">
                                        No fiscal periods defined.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                periods.map((period: FiscalPeriod) => (
                                    <TableRow key={period.id}>
                                        <TableCell className="font-bold">{period.name}</TableCell>
                                        <TableCell>{period.year}</TableCell>
                                        <TableCell>{period.month}</TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {new Date(period.startDate).toLocaleDateString('id-ID')} - {new Date(period.endDate).toLocaleDateString('id-ID')}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={period.status === 'OPEN' ? 'default' : 'secondary'} className="flex w-fit items-center gap-1">
                                                {period.status === 'OPEN' ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                                                {period.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {period.status === 'OPEN' && (
                                                <ClosePeriodButton id={period.id} name={period.name} />
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
