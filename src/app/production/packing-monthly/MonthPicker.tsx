'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';

export function MonthPicker({ defaultValue }: { defaultValue: string }) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        const params = new URLSearchParams(searchParams.toString());
        if (value) {
            params.set('month', value);
        } else {
            params.delete('month');
        }
        router.push(`/production/packing-monthly?${params.toString()}`);
    };

    return (
        <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Periode:</span>
            <Input
                type="month"
                defaultValue={defaultValue}
                onChange={handleChange}
                className="w-48 bg-background border-zinc-200 dark:border-zinc-800"
            />
        </div>
    );
}
