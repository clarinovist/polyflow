import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils/utils';

interface ProductionKpiCardProps {
    label: string;
    /** Already formatted (see lib/production/format). */
    value: string;
    unit?: string;
    caption?: string;
    /** Second line, e.g. affal share; color it via detailClassName. */
    detail?: string;
    detailClassName?: string;
    /** Decorative icon; callers pass it aria-hidden. */
    icon?: ReactNode;
    iconClassName?: string;
}

/**
 * KPI tile for production pages. The value wraps instead of overflowing and
 * the unit always sits next to it, so a long number never clips the card.
 */
export function ProductionKpiCard({
    label,
    value,
    unit,
    caption,
    detail,
    detailClassName,
    icon,
    iconClassName,
}: ProductionKpiCardProps) {
    return (
        <Card className="min-w-0 border-zinc-200 dark:border-zinc-800 shadow-sm">
            <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/75">
                            {label}
                        </p>
                        <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
                            <span className="text-2xl font-bold text-foreground tabular-nums break-words">
                                {value}
                            </span>
                            {unit && (
                                <span className="text-sm font-semibold text-muted-foreground">
                                    {unit}
                                </span>
                            )}
                        </div>
                        {caption && (
                            <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
                                {caption}
                            </p>
                        )}
                        {detail && (
                            <p
                                className={cn(
                                    'text-[11px] text-muted-foreground mt-1 tabular-nums',
                                    detailClassName,
                                )}
                            >
                                {detail}
                            </p>
                        )}
                    </div>
                    {icon && (
                        <div
                            className={cn(
                                'shrink-0 p-3 rounded-xl [&>svg]:h-6 [&>svg]:w-6',
                                iconClassName,
                            )}
                        >
                            {icon}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
