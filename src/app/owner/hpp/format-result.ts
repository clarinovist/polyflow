import { formatDecimal } from '@/lib/owner-hpp/number-input';

/** "12,3 %" for a percentage, "-" while it can not be computed. */
export function formatPercent(value: number | null): string {
    return value === null ? '-' : `${formatDecimal(value, 1)} %`;
}
