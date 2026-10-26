import { cn } from '@/lib/utils/utils';

interface KioskSegmentedProps<T extends string> {
    label: string;
    options: ReadonlyArray<{ value: T; label: string }>;
    value: T;
    onChange: (value: T) => void;
    className?: string;
}

/** Filter buttons in one row; replaces native selects, which have no arrow on tablets. */
export function KioskSegmented<T extends string>({
    label,
    options,
    value,
    onChange,
    className,
}: KioskSegmentedProps<T>) {
    return (
        <div
            role="group"
            aria-label={label}
            className={cn(
                'inline-flex flex-wrap gap-1 rounded-xl border-2 border-border bg-muted p-1',
                className,
            )}
        >
            {options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    aria-pressed={option.value === value}
                    onClick={() => onChange(option.value)}
                    className="min-h-12 rounded-lg px-4 text-base font-semibold text-muted-foreground transition-colors hover:text-foreground aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-sm"
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}
