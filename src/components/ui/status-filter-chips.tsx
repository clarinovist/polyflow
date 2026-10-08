'use client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/utils';
export interface StatusFilterOption<T extends string = string> {
    value: T;
    label: string;
    count: number;
}
export function StatusFilterChips<T extends string>({
    options,
    value,
    onChange,
    label = 'Filter status',
}: {
    options: readonly StatusFilterOption<T>[];
    value: T;
    onChange: (value: T) => void;
    label?: string;
}) {
    return (
        <div
            role="group"
            aria-label={label}
            className="flex max-w-full flex-wrap gap-2"
        >
            {options.map((o) => {
                const active = o.value === value;
                return (
                    <Button
                        key={o.value}
                        type="button"
                        variant={active ? 'default' : 'outline'}
                        size="sm"
                        aria-pressed={active}
                        onClick={() => onChange(o.value)}
                        className={cn(
                            'min-h-11 gap-2',
                            !active && 'text-muted-foreground',
                        )}
                    >
                        <span>{o.label}</span>
                        <span
                            aria-hidden="true"
                            className="rounded-full bg-background/20 px-1.5 tabular-nums"
                        >
                            {o.count}
                        </span>
                    </Button>
                );
            })}
        </div>
    );
}
