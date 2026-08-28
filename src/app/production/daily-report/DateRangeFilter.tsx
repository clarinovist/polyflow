'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface DateRangeFilterProps {
    from: string;
    to: string;
}

export function DateRangeFilter({ from, to }: DateRangeFilterProps) {
    const router = useRouter();
    const [fromValue, setFromValue] = useState(from);
    const [toValue, setToValue] = useState(to);

    const apply = () => {
        const params = new URLSearchParams();
        params.set('from', fromValue);
        params.set('to', toValue);
        router.push(`/production/daily-report?${params.toString()}`);
    };

    return (
        <div className="flex items-end gap-2">
            <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                    Dari
                </label>
                <Input
                    type="date"
                    value={fromValue}
                    max={toValue}
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
                    min={fromValue}
                    onChange={(e) => setToValue(e.target.value)}
                    className="w-[150px]"
                />
            </div>
            <Button size="sm" onClick={apply}>
                Terapkan
            </Button>
        </div>
    );
}
