import Link from 'next/link';
import { TrendingUp, TrendingDown, Minus, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/utils';
import type { MobileInsight } from '@/lib/mobile/types';

interface MobileInsightCardProps {
    insight: MobileInsight;
    className?: string;
}

const SEVERITY_STYLES: Record<string, string> = {
    INFO: 'border-l-blue-500',
    SUCCESS: 'border-l-green-500',
    WARNING: 'border-l-amber-500',
    CRITICAL: 'border-l-red-500',
};

const TREND_ICONS = {
    UP: TrendingUp,
    DOWN: TrendingDown,
    FLAT: Minus,
};

const TREND_COLORS = {
    UP: 'text-green-600 dark:text-green-400',
    DOWN: 'text-red-600 dark:text-red-400',
    FLAT: 'text-muted-foreground',
};

/**
 * Insight/KPI card for mobile portals.
 * Shows a metric with label, value, trend indicator, and optional action link.
 */
export function MobileInsightCard({ insight, className }: MobileInsightCardProps) {
    const TrendIcon = insight.trend
        ? TREND_ICONS[insight.trend.direction]
        : null;

    const content = (
        <div
            className={cn(
                'flex items-center gap-3 p-3 rounded-lg bg-card border border-border border-l-2',
                SEVERITY_STYLES[insight.severity],
                insight.href && 'hover:border-primary/30 active:scale-[0.98] transition-all',
                className,
            )}
        >
            <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">{insight.label}</p>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className="text-lg font-bold text-foreground tabular-nums">
                        {insight.value}
                    </span>
                    {insight.unit && (
                        <span className="text-xs text-muted-foreground">
                            {insight.unit}
                        </span>
                    )}
                </div>
                {insight.trend && TrendIcon && (
                    <div
                        className={cn(
                            'flex items-center gap-1 mt-1 text-[10px] font-medium',
                            TREND_COLORS[insight.trend.direction],
                        )}
                    >
                        <TrendIcon className="h-3 w-3" />
                        <span>
                            {insight.trend.label}
                        </span>
                    </div>
                )}
            </div>
            {insight.href && (
                <div className="flex items-center gap-1 shrink-0">
                    {insight.actionLabel && (
                        <span className="text-xs font-medium text-primary">
                            {insight.actionLabel}
                        </span>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
            )}
        </div>
    );

    if (insight.href) {
        return (
            <Link href={insight.href} className="block">
                {content}
            </Link>
        );
    }

    return content;
}
