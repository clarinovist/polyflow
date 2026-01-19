'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { DateRange } from 'react-day-picker';
import { DatePickerWithRange } from '@/components/ui/date-range-picker'; // Ensure this matches filename
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { startOfMonth, endOfMonth, subMonths } from 'date-fns';

export function AnalyticsToolbar() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();

    // Init dates from URL or defaults
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');

    // Default: Last 6 months approx if not set? 
    // Wait, let's sync with default server logic or just set initial state empty and let server handle default.
    // Better to reflect current state.

    const [date, setDate] = useState<DateRange | undefined>({
        from: fromParam ? new Date(fromParam) : undefined,
        to: toParam ? new Date(toParam) : undefined,
    });

    function handleDateChange(newDate: DateRange | undefined) {
        setDate(newDate);

        if (newDate?.from) {
            const params = new URLSearchParams(searchParams);
            params.set('from', newDate.from.toISOString());
            if (newDate.to) {
                params.set('to', newDate.to.toISOString());
            } else {
                params.delete('to');
            }

            startTransition(() => {
                router.replace(`${pathname}?${params.toString()}`);
            });
        } else {
            const params = new URLSearchParams(searchParams);
            params.delete('from');
            params.delete('to');
            startTransition(() => {
                router.replace(`${pathname}?${params.toString()}`);
            });
        }
    }

    async function handleExport() {
        try {
            const toastId = toast.loading('Generating report...');

            const exportRange = {
                from: date?.from || subMonths(startOfMonth(new Date()), 5),
                to: date?.to || endOfMonth(new Date()),
            };

            const isProduction = pathname.includes('/production');
            let result;

            if (isProduction) {
                const { exportProductionAnalytics } = await import('@/actions/analytics');
                result = await exportProductionAnalytics(exportRange);
            } else {
                const { exportSalesAnalytics } = await import('@/actions/analytics');
                result = await exportSalesAnalytics(exportRange);
            }

            if (result.error) {
                toast.error(result.error);
                toast.dismiss(toastId);
                return;
            }

            // Trigger download from base64 string
            if (result.data) {
                const link = document.createElement('a');
                link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${result.data}`;
                link.download = `${isProduction ? 'Production' : 'Sales'}_Analytics_${new Date().toISOString().slice(0, 10)}.xlsx`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                toast.success('Report downloaded successfully');
            }
            toast.dismiss(toastId);
        } catch (error) {
            console.error(error);
            toast.error('Failed to export report');
        }
    }

    return (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 w-full">
            <div className="flex items-center gap-2">
                <DatePickerWithRange
                    date={date}
                    onDateChange={handleDateChange}
                />
                {isPending && <span className="text-xs text-muted-foreground animate-pulse">Updating...</span>}
            </div>

            <Button variant="outline" onClick={handleExport}>
                <Download className="mr-2 h-4 w-4" />
                Export Report
            </Button>
        </div>
    );
}
