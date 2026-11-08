import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/utils';

interface MobilePortalHeaderProps {
    title?: string;
    icon?: ReactNode;
    actions?: ReactNode;
    className?: string;
    titleClassName?: string;
}

/** Compact, safe-area-aware portal identity header. Page titles remain the H1. */
export function MobilePortalHeader({
    title,
    icon,
    actions,
    className,
    titleClassName,
}: MobilePortalHeaderProps) {
    return (
        <header
            className={cn(
                'sticky top-0 z-40 border-b border-border bg-background/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur ',
                className,
            )}
        >
            <div
                className={cn(
                    'flex min-h-12 min-w-0 items-center gap-3',
                    title ? 'justify-between' : 'justify-end',
                )}
            >
                {title && (
                    <div className="flex min-w-0 items-center gap-2">
                        {icon}
                        <span
                            className={cn(
                                'truncate font-semibold text-foreground',
                                titleClassName,
                            )}
                        >
                            {title}
                        </span>
                    </div>
                )}
                {actions && (
                    <div className="flex shrink-0 items-center gap-2">
                        {actions}
                    </div>
                )}
            </div>
        </header>
    );
}
