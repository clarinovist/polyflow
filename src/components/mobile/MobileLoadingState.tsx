import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/utils';

interface MobileLoadingStateProps {
    message?: string;
    className?: string;
}

/**
 * Standard loading state for mobile pages.
 * Shows a centered spinner with optional message.
 */
export function MobileLoadingState({
    message = 'Memuat data...',
    className,
}: MobileLoadingStateProps) {
    return (
        <div
            className={cn(
                'flex flex-col items-center justify-center py-12',
                className,
            )}
        >
            <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
            <p className="text-xs text-muted-foreground mt-2">{message}</p>
        </div>
    );
}
