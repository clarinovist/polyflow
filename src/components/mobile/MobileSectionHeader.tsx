import { cn } from '@/lib/utils/utils';

interface MobileSectionHeaderProps {
    title: string;
    action?: React.ReactNode;
    className?: string;
    level?: 1 | 2;
}

/**
 * Section header for mobile pages.
 * Used to separate sections (e.g. "Hari Ini", "Tugas", "Insight").
 */
export function MobileSectionHeader({
    title,
    action,
    className,
    level = 2,
}: MobileSectionHeaderProps) {
    const Heading = level === 1 ? 'h1' : 'h2';

    return (
        <div
            className={cn(
                'flex items-center justify-between px-4 py-2',
                className,
            )}
        >
            <Heading
                className={cn(
                    'font-semibold tracking-wider text-muted-foreground uppercase',
                    level === 1 ? 'text-sm' : 'text-xs',
                )}
            >
                {title}
            </Heading>
            {action}
        </div>
    );
}
