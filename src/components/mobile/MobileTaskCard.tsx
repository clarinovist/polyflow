import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/utils';
import type { MobileTaskPriority } from '@/lib/mobile/types';

interface MobileTaskCardProps {
    id: string;
    type?: string;
    title: string;
    subtitle?: string;
    priority?: MobileTaskPriority;
    dueAt?: string;
    href: string;
    className?: string;
}

const PRIORITY_STYLES: Record<MobileTaskPriority, string> = {
    LOW: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    NORMAL: 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400',
    HIGH: 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400',
    URGENT: 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400',
};

const PRIORITY_LABELS: Record<MobileTaskPriority, string> = {
    LOW: 'Rendah',
    NORMAL: 'Normal',
    HIGH: 'Tinggi',
    URGENT: 'Mendesak',
};

/**
 * Task card for mobile portals.
 * Shows task title, subtitle, priority badge, and due date with link.
 */
export function MobileTaskCard({
    title,
    subtitle,
    priority = 'NORMAL',
    dueAt,
    href,
    className,
}: MobileTaskCardProps) {
    return (
        <Link
            href={href}
            className={cn(
                'flex items-center gap-3 p-3 rounded-lg bg-card border border-border hover:border-primary/30 active:scale-[0.98] transition-all',
                className,
            )}
        >
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium text-foreground truncate">
                        {title}
                    </h4>
                    <span
                        className={cn(
                            'shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded',
                            PRIORITY_STYLES[priority],
                        )}
                    >
                        {PRIORITY_LABELS[priority]}
                    </span>
                </div>
                {subtitle && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {subtitle}
                    </p>
                )}
                {dueAt && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                        Jatuh tempo: {dueAt}
                    </p>
                )}
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </Link>
    );
}
