'use client';

import { Input } from '@/components/ui/input';
import {
    draftFromNumber,
    formatDecimal,
    parseDecimalInput,
    type NumberInputKind,
} from '@/lib/owner-hpp/number-input';
import { cn } from '@/lib/utils/utils';
import { useState } from 'react';

interface NumberFieldProps {
    label: string;
    value: number;
    onChange: (value: number) => void;
    /** Reject zero (e.g. an output quantity). */
    positive?: boolean;
    maxFractionDigits?: number;
    className?: string;
    /** Money accepts "14.500"; quantities treat a lone dot as a decimal point. */
    kind?: NumberInputKind;
    /** Show the label on wide screens too (default: phones only). */
    showLabel?: boolean;
    /** Small dimmed unit shown inside the input's right edge (e.g. "kg"). */
    suffix?: string;
}

function isAccepted(value: number, positive: boolean): boolean {
    return positive ? value > 0 : value >= 0;
}

export function NumberField({
    label,
    value,
    onChange,
    positive = false,
    maxFractionDigits = 4,
    kind = 'quantity',
    className,
    showLabel = false,
    suffix,
}: NumberFieldProps) {
    // While focused the field shows what was typed; otherwise the formatted value.
    const [draft, setDraft] = useState<string | null>(null);

    const parsed = draft === null ? value : parseDecimalInput(draft, kind);
    const isInvalid =
        draft !== null &&
        draft.trim() !== '' &&
        (parsed === null || !isAccepted(parsed, positive));

    function handleChange(text: string) {
        setDraft(text);
        const next =
            text.trim() === '' && !positive ? 0 : parseDecimalInput(text, kind);
        if (next !== null && isAccepted(next, positive)) onChange(next);
    }

    return (
        <label className={cn('flex min-w-0 flex-col gap-1', className)}>
            <span
                className={cn(
                    'text-xs text-muted-foreground',
                    !showLabel && 'lg:sr-only',
                )}
            >
                {label}
            </span>
            <span className="relative block">
                <Input
                    inputMode="decimal"
                    aria-label={label}
                    aria-invalid={isInvalid}
                    className={cn(
                        'h-11 text-right font-mono tabular-nums lg:h-9',
                        suffix && 'pr-11',
                    )}
                    value={draft ?? formatDecimal(value, maxFractionDigits)}
                    onFocus={(event) => {
                        setDraft(draftFromNumber(value));
                        event.currentTarget.select();
                    }}
                    onBlur={() => setDraft(null)}
                    onChange={(event) => handleChange(event.target.value)}
                />
                {suffix ? (
                    <span
                        aria-hidden="true"
                        className="pointer-events-none absolute right-3 top-1/2 max-w-8 -translate-y-1/2 truncate text-xs text-muted-foreground/70"
                    >
                        {suffix}
                    </span>
                ) : null}
            </span>
        </label>
    );
}
