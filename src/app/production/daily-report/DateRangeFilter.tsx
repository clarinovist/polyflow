'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface DateRangeFilterProps {
    from: string | null;
    to: string | null;
    /** True when the current view is all-time (range=all). */
    allTime: boolean;
    /** Machine-recap filter param to preserve across navigation. */
    mesin?: string;
}

/**
 * Top period filter (KPIs + per-day table). Empty both dates + Terapkan =
 * all time (range=all). Preset chips fill the inputs (Semua waktu applies
 * all-time immediately); typing a date drops the URL back to period mode.
 */
export function DateRangeFilter({
    from,
    to,
    allTime,
    mesin,
}: DateRangeFilterProps) {
    const router = useRouter();
    // Inputs show the effective defaults (30d window) even in all-time mode,
    // but stay untouched until the user edits them.
    const effectiveFrom = from ?? allTimeDefaultFrom();
    const [fromValue, setFromValue] = useState(effectiveFrom);
    const [toValue, setToValue] = useState(to ?? todayStr());

    const push = (params: URLSearchParams) => {
        if (mesin) params.set('mesin', mesin);
        router.push(`/production/daily-report?${params.toString()}`);
    };

    const apply = () => {
        const params = new URLSearchParams();
        if (!fromValue && !toValue) {
            params.set('range', 'all');
        } else {
            if (fromValue) params.set('from', fromValue);
            if (toValue) params.set('to', toValue);
        }
        push(params);
    };

    const applyAllTime = () => push(new URLSearchParams({ range: 'all' }));

    const applyMonthPreset = (start: string, end: string) => {
        setFromValue(start);
        setToValue(end);
        const params = new URLSearchParams();
        params.set('from', start);
        params.set('to', end);
        push(params);
    };

    return (
        <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                    Dari
                </label>
                <Input
                    type="date"
                    value={fromValue}
                    max={toValue || undefined}
                    onChange={(e) => setFromValue(e.target.value)}
                    className="w-[150px]"
                />
            </div>
            <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                    Sampai
                </label>
                <Input
                    type="date"
                    value={toValue}
                    min={fromValue || undefined}
                    onChange={(e) => setToValue(e.target.value)}
                    className="w-[150px]"
                />
            </div>
            <div className="flex items-center gap-2">
                <Button size="sm" onClick={apply}>
                    Terapkan
                </Button>
                <Button
                    size="sm"
                    variant={allTime ? 'default' : 'outline'}
                    onClick={applyAllTime}
                >
                    Semua waktu
                </Button>
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => applyMonthPreset(monthPresetStart(0), todayStr())}
                >
                    Bulan ini
                </Button>
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                        applyMonthPreset(monthPresetStart(1), monthPresetEnd(1))
                    }
                >
                    Bulan lalu
                </Button>
            </div>
        </div>
    );
}

// --- date helpers (browser-local is fine: these only prefill client inputs) ---

function pad(n: number): string {
    return String(n).padStart(2, '0');
}

function todayStr(): string {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function allTimeDefaultFrom(): string {
    const d = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function monthPresetStart(monthsAgo: number): string {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - monthsAgo);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}

function monthPresetEnd(monthsAgo: number): string {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - monthsAgo + 1);
    d.setDate(0);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
