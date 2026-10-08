import type { ReactNode } from 'react';
export function ListResultSummary({
    start,
    end,
    total,
    hint,
}: {
    start: number;
    end: number;
    total: number;
    hint?: ReactNode;
}) {
    const safeStart = total === 0 ? 0 : Math.max(start, 1);
    const safeEnd = Math.min(Math.max(end, 0), total);
    return (
        <div className="flex flex-col gap-1 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p role="status" aria-live="polite">
                Menampilkan {safeStart}–{safeEnd} dari {total}
            </p>
            {hint && <div className="text-xs">{hint}</div>}
        </div>
    );
}
