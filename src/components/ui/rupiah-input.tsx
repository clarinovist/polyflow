'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils/utils';
import { parseRupiah } from '@/lib/utils/rupiah-parse';
import { formatIndonesianPrice } from '@/lib/utils/price-format';

/**
 * Input rupiah dengan pemisah ribuan saat tidak fokus (T6, fix T5).
 *
 * Saat fokus: menampilkan apa yang diketik user apa adanya (termasuk sufiks
 * "450jt" sebelum di-blur), supaya user bisa mengetik natural.
 * Saat blur: parse via parseRupiah (delegasi ke parseIndonesianPrice untuk
 * bagian ribuan/desimal — lihat rupiah-parse.ts), lalu tampilkan terformat.
 * Kalau parse gagal, input dikembalikan ke nilai `value` terakhir yang valid
 * (tidak ada nilai "setengah jadi" yang lolos ke parent).
 */
export function RupiahInput({
    value,
    onValueChange,
    className,
    placeholder = '0',
    ...props
}: {
    value: number | null | undefined;
    onValueChange: (value: number | null) => void;
} & Omit<
    React.ComponentProps<'input'>,
    'value' | 'onChange' | 'type' | 'onBlur' | 'onFocus'
>) {
    const [isFocused, setIsFocused] = React.useState(false);
    const [rawText, setRawText] = React.useState('');

    const displayValue = isFocused
        ? rawText
        : value != null
          ? formatIndonesianPrice(value)
          : '';

    return (
        <Input
            {...props}
            type="text"
            inputMode="decimal"
            className={cn('text-right tabular-nums', className)}
            placeholder={placeholder}
            value={displayValue}
            onFocus={() => {
                setRawText(value != null ? String(value) : '');
                setIsFocused(true);
            }}
            onChange={(e) => setRawText(e.target.value)}
            onBlur={() => {
                setIsFocused(false);
                const trimmed = rawText.trim();
                if (trimmed === '') {
                    onValueChange(null);
                    return;
                }
                const parsed = parseRupiah(trimmed);
                // Parse gagal → biarkan value lama (tidak diteruskan ke parent),
                // input otomatis kembali ke format terakhir yang valid.
                if (parsed != null) onValueChange(parsed);
            }}
        />
    );
}
