'use client';

import { useState, useTransition } from 'react';
import { FiscalPeriod, PeriodStatus } from '@prisma/client';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Lock, LockOpen, Loader2, CalendarPlus } from 'lucide-react';
import { toast } from 'sonner';
import { generatePeriodsForYear, closePeriod, reopenPeriod } from '@/actions/finance/period-actions';
import { useRouter } from 'next/navigation';

interface PeriodManagementClientProps {
    initialPeriods: FiscalPeriod[];
    currentYear: number;
    userId: string;
}

export function PeriodManagementClient({ initialPeriods, currentYear, userId }: PeriodManagementClientProps) {
    const [year, setYear] = useState(currentYear.toString());
    const [periods] = useState(initialPeriods);
    const [isPending, startTransition] = useTransition();
    const router = useRouter();

    const handleGenerate = async () => {
        startTransition(async () => {
            try {
                await generatePeriodsForYear(parseInt(year));
                toast.success(`Periods for ${year} generated successfully.`);
                router.refresh();
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (error: any) {
                toast.error(error.message || "Failed to generate periods.");
            }
        });
    };

    const handleStatusChange = async (id: string, currentStatus: PeriodStatus) => {
        startTransition(async () => {
            try {
                if (currentStatus === 'OPEN') {
                    await closePeriod(id, userId);
                    toast.success("Fiscal period closed.");
                } else {
                    await reopenPeriod(id);
                    toast.success("Fiscal period reopened.");
                }
                router.refresh();
            } catch (error) { // eslint-disable-line @typescript-eslint/no-unused-vars
                toast.error("Failed to update status");
            }
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Fiscal Periods</h2>
                    <p className="text-muted-foreground">Manage accounting periods and closing.</p>
                </div>
                <div className="flex items-center gap-4">
                    <Select value={year} onValueChange={setYear}>
                        <SelectTrigger className="w-[120px]">
                            <SelectValue placeholder="Year" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="2024">2024</SelectItem>
                            <SelectItem value="2025">2025</SelectItem>
                            <SelectItem value="2026">2026</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex justify-between items-center">
                        <span>Periods for {year}</span>
                        {periods.length === 0 && (
                            <Button onClick={handleGenerate} disabled={isPending}>
                                {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarPlus className="mr-2 h-4 w-4" />}
                                Generate Periods
                            </Button>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Period Name</TableHead>
                                <TableHead>Start Date</TableHead>
                                <TableHead>End Date</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {periods.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">
                                        No periods found for {year}. Click generate to start.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                periods.map((period) => (
                                    <TableRow key={period.id}>
                                        <TableCell className="font-medium">{period.name}</TableCell>
                                        <TableCell>{format(new Date(period.startDate), 'dd MMM yyyy')}</TableCell>
                                        <TableCell>{format(new Date(period.endDate), 'dd MMM yyyy')}</TableCell>
                                        <TableCell>
                                            <Badge variant={period.status === 'OPEN' ? 'default' : 'secondary'}>
                                                {period.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleStatusChange(period.id, period.status)}
                                                disabled={isPending}
                                            >
                                                {period.status === 'OPEN' ? (
                                                    <><Lock className="mr-2 h-4 w-4" /> Close</>
                                                ) : (
                                                    <><LockOpen className="mr-2 h-4 w-4" /> Reopen</>
                                                )}
                                            </Button>
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
