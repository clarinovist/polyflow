import { cn } from '@/lib/utils/utils';

interface MobileSectionHeaderProps {
    title: string;
    action?: React.ReactNode;
    className?: string;
}

/**
 * Section header for mobile pages.
 * Used to separate sections (e.g. "Hari Ini", "Tugas", "Insight").
 */
export function MobileSectionHeader({
    title,
    action,
    className,
}: MobileSectionHeaderProps) {
    return (
        <div
            className={cn(
                'flex items-center justify-between px-4 py-2',
                className,
            )}
        >
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {title}
            </h2>
            {action}
        </div>
    );
}
