'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface DateRangeFilterProps {
    from: string;
    to: string;
    /** Server-resolved WIB date; keeps presets consistent across timezones. */
    today: string;
    /** Machine-recap filter param to preserve across navigation. */
    mesin?: string;
}

/** Reset drafts when navigation (including back/forward) changes the period. */
export function DateRangeFilter(props: DateRangeFilterProps) {
    return <DateRangeForm key={`${props.from}:${props.to}:${props.today}`} {...props} />;
}

function DateRangeForm({ from, to, today, mesin }: DateRangeFilterProps) {
    const router = useRouter();
    const id = useId();
    const [fromValue, setFromValue] = useState(from);
    const [toValue, setToValue] = useState(to);
    const monthStart = `${today.slice(0, 7)}-01`;
    const [year, month] = today.split('-').map(Number);
    const previousMonthEnd = new Date(Date.UTC(year, month - 1, 0))
        .toISOString().slice(0, 10);
    const previousMonthStart = `${previousMonthEnd.slice(0, 7)}-01`;
    const isDirty = fromValue !== from || toValue !== to;
    const isValid = Boolean(fromValue && toValue && fromValue <= toValue);
    const isCurrentMonth = !isDirty && from === monthStart && to === today;
    const isPreviousMonth = !isDirty && from === previousMonthStart && to === previousMonthEnd;

    const applyRange = (start: string, end: string) => {
        setFromValue(start);
        setToValue(end);
        const params = new URLSearchParams({ from: start, to: end });
        if (mesin) params.set('mesin', mesin);
        router.push(`/production/daily-report?${params.toString()}`);
    };

    return (
        <form
            aria-label="Periode produksi"
            className="flex flex-col gap-4 rounded-lg border bg-card p-4 lg:flex-row lg:items-end lg:justify-between"
            onSubmit={(event) => {
                event.preventDefault();
                if (isDirty && isValid) applyRange(fromValue, toValue);
            }}
        >
            <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Periode (WIB)</p>
                <div className="flex flex-wrap gap-2">
                    <Button
                        type="button"
                        variant={isCurrentMonth ? 'default' : 'outline'}
                        aria-pressed={isCurrentMonth}
                        onClick={() => applyRange(monthStart, today)}
                    >
                        Bulan ini
                    </Button>
                    <Button
                        type="button"
                        variant={isPreviousMonth ? 'default' : 'outline'}
                        aria-pressed={isPreviousMonth}
                        onClick={() => applyRange(previousMonthStart, previousMonthEnd)}
                    >
                        Bulan lalu
                    </Button>
                </div>
            </div>
            <div className="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap">
                <div className="min-w-0 space-y-1">
                    <label htmlFor={`${id}-from`} className="block text-xs font-medium text-muted-foreground">
                        Dari
                    </label>
                    <Input
                        id={`${id}-from`}
                        name="from"
                        type="date"
                        required
                        value={fromValue}
                        max={toValue || undefined}
                        onChange={(event) => setFromValue(event.target.value)}
                        className="w-full sm:w-[160px]"
                    />
                </div>
                <div className="min-w-0 space-y-1">
                    <label htmlFor={`${id}-to`} className="block text-xs font-medium text-muted-foreground">
                        Sampai
                    </label>
                    <Input
                        id={`${id}-to`}
                        name="to"
                        type="date"
                        required
                        value={toValue}
                        min={fromValue || undefined}
                        onChange={(event) => setToValue(event.target.value)}
                        className="w-full sm:w-[160px]"
                    />
                </div>
                <Button
                    type="submit"
                    variant="outline"
                    disabled={!isDirty || !isValid}
                    className="col-span-2"
                >
                    Terapkan
                </Button>
            </div>
        </form>
    );
}
