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
            role="status"
            aria-live="polite"
            className={cn(
                'flex flex-col items-center justify-center py-12',
                className,
            )}
        >
            <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="mt-2 text-xs text-muted-foreground">{message}</p>
        </div>
    );
}
