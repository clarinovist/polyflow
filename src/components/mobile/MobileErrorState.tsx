'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils/utils';

interface MobileErrorStateProps {
    title?: string;
    message: string;
    onRetry?: () => void;
    className?: string;
}

/**
 * Standard error state for mobile pages.
 * Shows error message with optional retry button.
 */
export function MobileErrorState({
    title = 'Terjadi kesalahan',
    message,
    onRetry,
    className,
}: MobileErrorStateProps) {
    return (
        <div
            className={cn(
                'flex flex-col items-center justify-center py-12 px-6 text-center',
                className,
            )}
        >
            <div className="h-12 w-12 rounded-full bg-red-50 dark:bg-red-950/50 flex items-center justify-center mb-3">
                <AlertTriangle className="h-6 w-6 text-red-500" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-[280px]">
                {message}
            </p>
            {onRetry && (
                <button
                    onClick={onRetry}
                    className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Coba lagi
                </button>
            )}
        </div>
    );
}
