'use client';

import { useState, useTransition, useEffect } from 'react';
import { FiscalPeriod, PeriodStatus } from '@prisma/client';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Lock, LockOpen, Loader2, CalendarPlus } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { generatePeriodsForYear, closePeriod, reopenPeriod, getIncomeStatementSummary } from '@/actions/finance/period-actions';
import { useRouter } from 'next/navigation';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { formatRupiah } from '@/lib/utils';

interface PeriodManagementClientProps {
    initialPeriods: FiscalPeriod[];
    currentYear: number;
    userId: string;
}

export function PeriodManagementClient({ initialPeriods, currentYear, userId }: PeriodManagementClientProps) {
    const [year, setYear] = useState(currentYear.toString());
    const [isPending, startTransition] = useTransition();
    const router = useRouter();

    // Sync state if prop changes from external (e.g. URL)
    useEffect(() => {
        setYear(currentYear.toString());
    }, [currentYear]);

    const handleYearChange = (newYear: string) => {
        setYear(newYear);
        router.push(`/finance/periods?year=${newYear}`);
    };

    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [selectedPeriod, setSelectedPeriod] = useState<{ id: string, name: string } | null>(null);
    const [closingSummary, setClosingSummary] = useState<{
        totalRevenue: number,
        totalOpEx: number,
        netIncome: number
    } | null>(null);

    const handleGenerate = async () => {
        startTransition(async () => {
            try {
                await generatePeriodsForYear(parseInt(year));
                toast.success(`Periods for ${year} generated successfully.`);
                router.refresh();
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : "Failed to generate periods.";
                toast.error(message);
            }
        });
    };

    const handleCloseClick = async (id: string, name: string) => {
        setSelectedPeriod({ id, name });
        try {
            const summary = await getIncomeStatementSummary(id);
            setClosingSummary(summary);
            setIsConfirmOpen(true);
        } catch (_error) {
            toast.error("Failed to fetch period summary");
        }
    };

    const handleConfirmClose = async () => {
        if (!selectedPeriod) return;

        startTransition(async () => {
            try {
                await closePeriod(selectedPeriod.id, userId);
                toast.success(`Fiscal period ${selectedPeriod.name} closed with generated journal entries.`);
                setIsConfirmOpen(false);
                router.refresh();
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : "Failed to close period";
                toast.error(message);
            }
        });
    };

    const handleStatusChange = async (id: string, currentStatus: PeriodStatus) => {
        if (currentStatus === 'OPEN') return; // Handled by handleCloseClick

        startTransition(async () => {
            try {
                await reopenPeriod(id);
                toast.success("Fiscal period reopened.");
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
                    <Select value={year} onValueChange={handleYearChange}>
                        <SelectTrigger className="w-[120px]">
                            <SelectValue placeholder="Year" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="2024">2024</SelectItem>
                            <SelectItem value="2025">2025</SelectItem>
                            <SelectItem value="2026">2026</SelectItem>
                            <SelectItem value="2027">2027</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex justify-between items-center">
                        <span>Periods for {year}</span>
                        {initialPeriods.length === 0 && (
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
                            {initialPeriods.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">
                                        No periods found for {year}. Click generate to start.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                initialPeriods.map((period) => (
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
                                                onClick={() => period.status === 'OPEN' ? handleCloseClick(period.id, period.name) : handleStatusChange(period.id, period.status)}
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

            <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
                <AlertDialogContent className="max-w-md">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Close Fiscal Period: {selectedPeriod?.name}</AlertDialogTitle>
                        <AlertDialogDescription>
                            Closing this period will automatically generate closing journal entries to reset Revenue and Expense accounts. This action is critical for financial integrity.
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    {closingSummary && (
                        <div className="py-4 space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Total Revenue</span>
                                <span className="font-semibold">{formatRupiah(closingSummary.totalRevenue)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Total Expenses</span>
                                <span className="font-semibold text-destructive">({formatRupiah(closingSummary.totalOpEx)})</span>
                            </div>
                            <Separator />
                            <div className="flex justify-between text-base font-bold">
                                <span>Estimated Net Income</span>
                                <span className={closingSummary.netIncome >= 0 ? "text-primary" : "text-destructive"}>
                                    {formatRupiah(closingSummary.netIncome)}
                                </span>
                            </div>
                            <p className="text-[10px] text-muted-foreground italic">
                                * Net income will be transferred to Current Year Earnings (33000).
                            </p>
                        </div>
                    )}

                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                e.preventDefault();
                                handleConfirmClose();
                            }}
                            disabled={isPending}
                            className="bg-primary hover:bg-primary/90"
                        >
                            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Confirm & Generate Entries
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
