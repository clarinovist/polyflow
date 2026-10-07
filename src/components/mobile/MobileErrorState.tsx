'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils/utils';

interface MobileErrorStateProps {
    title?: string;
    message?: string;
    onRetry?: () => void;
    retryLabel?: string;
    headingLevel?: 1 | 2 | 3;
    className?: string;
}

/**
 * Standard error state for mobile pages.
 * Shows error message with optional retry button.
 */
export function MobileErrorState({
    title = 'Terjadi kesalahan',
    message = 'Data tidak tersedia saat ini. Coba muat ulang; angka kosong bukan berarti tidak ada transaksi.',
    onRetry,
    retryLabel = 'Coba lagi',
    headingLevel = 2,
    className,
}: MobileErrorStateProps) {
    const Heading = headingLevel === 1 ? 'h1' : headingLevel === 2 ? 'h2' : 'h3';

    return (
        <section
            role="alert"
            className={cn(
                'flex flex-col items-center justify-center px-6 py-12 text-center',
                className,
            )}
        >
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/50">
                <AlertTriangle aria-hidden="true" className="h-6 w-6 text-red-500" />
            </div>
            <Heading className="text-sm font-semibold text-foreground">
                {title}
            </Heading>
            <p className="mt-1 max-w-[280px] text-xs text-muted-foreground">
                {message}
            </p>
            {onRetry && (
                <button
                    type="button"
                    onClick={onRetry}
                    className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
                    {retryLabel}
                </button>
            )}
        </section>
    );
}
