'use client';

import * as React from 'react';
import { Input } from '../../ui/input';
import {
    formatLocalizedDecimal,
    parseLocalizedDecimalInput,
} from '@/lib/utils/decimal-input';
import { cn } from '@/lib/utils/utils';

interface AccountingInputProps extends Omit<
    React.ComponentProps<typeof Input>,
    'onChange' | 'value'
> {
    value: number;
    onValueChange: (value: number) => void;
}

export function AccountingInput({
    value,
    onValueChange,
    className,
    onBlur,
    onFocus,
    ...props
}: AccountingInputProps) {
    const [displayValue, setDisplayValue] = React.useState(() =>
        value === 0 || !Number.isFinite(value)
            ? ''
            : formatLocalizedDecimal(value, 'money'),
    );
    const [isFocused, setIsFocused] = React.useState(false);
    const internalRef = React.useRef<HTMLInputElement>(null);
    const parsed = parseLocalizedDecimalInput(displayValue, 'money');
    const isInvalid =
        parsed.status === 'invalid' ||
        (!isFocused && parsed.status === 'intermediate');

    React.useEffect(() => {
        internalRef.current?.setCustomValidity(
            parsed.status === 'invalid' || parsed.status === 'intermediate'
                ? 'Masukkan nominal yang valid (maksimal 2 desimal).'
                : '',
        );
    }, [parsed.status]);

    // External reset and debit/credit auto-clear must update the visible text,
    // while intermediate focused input such as "45," remains untouched.
    React.useEffect(() => {
        const current = parseLocalizedDecimalInput(displayValue, 'money');
        if (
            !isFocused &&
            Number.isFinite(value) &&
            (current.status !== 'valid' || current.value !== value)
        ) {
            setDisplayValue(
                value === 0 ? '' : formatLocalizedDecimal(value, 'money'),
            );
        }
    }, [value, displayValue, isFocused]);

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const rawValue = event.target.value;
        setDisplayValue(rawValue);

        const result = parseLocalizedDecimalInput(rawValue, 'money');
        if (result.status === 'valid') {
            onValueChange(result.value);
        } else if (result.status === 'empty') {
            onValueChange(0);
        } else if (result.status === 'invalid') {
            onValueChange(Number.NaN);
        }
    };

    const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
        setIsFocused(false);
        const result = parseLocalizedDecimalInput(displayValue, 'money');
        if (result.status === 'valid') {
            setDisplayValue(formatLocalizedDecimal(result.value, 'money'));
        } else if (result.status === 'empty') {
            setDisplayValue('');
        } else {
            // A trailing separator is safe while typing, but cannot become a
            // stale/partial amount when the field is committed.
            onValueChange(Number.NaN);
        }
        onBlur?.(event);
    };

    return (
        <Input
            {...props}
            ref={internalRef}
            type="text"
            inputMode="decimal"
            className={cn('text-right font-mono', className)}
            value={displayValue}
            onChange={handleChange}
            onFocus={(event) => {
                setIsFocused(true);
                onFocus?.(event);
            }}
            onBlur={handleBlur}
            aria-invalid={isInvalid || undefined}
            placeholder="0"
        />
    );
}

export function formatAccounting(absAmount: number) {
    return formatLocalizedDecimal(absAmount, 'money');
}
