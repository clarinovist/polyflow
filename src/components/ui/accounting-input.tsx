'use client';

import * as React from 'react';
import { Input } from './input';
import { cn } from '@/lib/utils';

interface AccountingInputProps extends Omit<React.ComponentProps<typeof Input>, 'onChange' | 'value'> {
    value: number;
    onValueChange: (value: number) => void;
}

export function AccountingInput({ value, onValueChange, className, ...props }: AccountingInputProps) {
    const [displayValue, setDisplayValue] = React.useState('');

    const formatNumeric = (val: string) => {
        // Remove all non-digits
        const digits = val.replace(/\D/g, '');
        return digits ? parseInt(digits, 10) : 0;
    };

    // Update display value when the numerical value changes from outside (e.g. form reset or auto-clear)
    React.useEffect(() => {
        const formattedValue = value === 0 ? '' : new Intl.NumberFormat('id-ID').format(value);
        if (formatNumeric(displayValue) !== value) {
            setDisplayValue(formattedValue);
        }
    }, [value, displayValue]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const rawValue = e.target.value;
        const numericValue = formatNumeric(rawValue);

        // Update numerical value (for the form)
        onValueChange(numericValue);

        // Update display value (with dots)
        const formatted = numericValue === 0 && rawValue === '' ? '' : new Intl.NumberFormat('id-ID').format(numericValue);
        setDisplayValue(formatted);
    };

    return (
        <Input
            {...props}
            type="text"
            className={cn('text-right font-mono', className)}
            value={displayValue}
            onChange={handleChange}
            placeholder="0"
        />
    );
}

export function formatAccounting(absAmount: number) {
    return new Intl.NumberFormat('id-ID').format(absAmount);
}
