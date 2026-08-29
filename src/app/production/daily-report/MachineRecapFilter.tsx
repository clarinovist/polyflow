'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface MachineRecapFilterProps {
    /** 'all' or 'YYYY-MM' (current selection rendered in the trigger). */
    value: 'all' | string;
    /** Latest-first month option values, e.g. ['2026-08', '2026-07']. */
    monthOptions: string[];
    /** Other URL params to preserve (from/to/range of the top filter). */
    carryParams: Record<string, string | undefined>;
}

export const MACHINE_RECAP_ALL = 'all';

/** Label shown in the select trigger. */
export function machineRecapValueLabel(value: string): string {
    return value === MACHINE_RECAP_ALL ? 'Semua waktu' : value;
}

export function MachineRecapFilter({
    value,
    monthOptions,
    carryParams,
}: MachineRecapFilterProps) {
    const router = useRouter();
    const [selected, setSelected] = useState(value);

    const apply = (next: string) => {
        setSelected(next);
        const params = new URLSearchParams();
        for (const [key, val] of Object.entries(carryParams)) {
            if (val) params.set(key, val);
        }
        params.set('mesin', next);
        router.push(`/production/daily-report?${params.toString()}`);
    };

    return (
        <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                Rekap mesin:
            </span>
            <Select value={selected} onValueChange={apply}>
                <SelectTrigger className="w-[170px] h-8">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value={MACHINE_RECAP_ALL}>
                        Semua waktu
                    </SelectItem>
                    {monthOptions.map((m) => (
                        <SelectItem key={m} value={m}>
                            {machineRecapValueLabel(m)}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}
