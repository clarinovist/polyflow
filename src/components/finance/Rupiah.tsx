'use client';

import { formatRupiahParts } from '@/lib/utils/utils';
import { cn } from '@/lib/utils/utils';

interface RupiahProps {
  value: number | null | undefined;
  className?: string;
  /** Render as bold (for totals / group headers) */
  bold?: boolean;
}

/**
 * Rupiah amount with split alignment:
 *   "Rp" always left-aligned | number always right-aligned
 *
 * Negative values show in parentheses with destructive color.
 *
 * Example rendered:
 *   | Rp            25.000.000 |
 *   | Rp 128.196.020           |
 *   | (Rp         51.607.471)  |
 */
export function Rupiah({ value, className, bold }: RupiahProps) {
  const { prefix, amount, isNegative } = formatRupiahParts(value);

  return (
    <span className={cn('flex items-baseline gap-1 font-mono tabular-nums w-full', bold && 'font-bold', className)}>
      {prefix && (
        <span className="text-muted-foreground shrink-0">{prefix}</span>
      )}
      <span className={cn('ml-auto', isNegative && 'text-destructive')}>
        {isNegative ? `(${amount})` : amount}
      </span>
    </span>
  );
}
