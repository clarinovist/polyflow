import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils/utils';

interface MobileEmptyStateProps {
    icon?: React.ComponentType<{ className?: string }>;
    title: string;
    description?: string;
    action?: React.ReactNode;
    className?: string;
}

/**
 * Standard empty state for mobile pages.
 * Used when a list has no items or a section has no data.
 */
export function MobileEmptyState({
    icon: Icon = Inbox,
    title,
    description,
    action,
    className,
}: MobileEmptyStateProps) {
    return (
        <div
            className={cn(
                'flex flex-col items-center justify-center py-12 px-6 text-center',
                className,
            )}
        >
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                <Icon className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            {description && (
                <p className="text-xs text-muted-foreground mt-1 max-w-[240px]">
                    {description}
                </p>
            )}
            {action && <div className="mt-4">{action}</div>}
        </div>
    );
}
