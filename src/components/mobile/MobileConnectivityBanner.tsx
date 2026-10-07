'use client';

import { WifiOff, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils/utils';

interface MobileConnectivityBannerProps {
    isOnline: boolean;
    isSlowConnection?: boolean;
    lastUpdated?: Date | null;
    onRetry?: () => void;
    className?: string;
}

/**
 * Banner that shows connectivity status.
 * Visible when offline or on slow connection. Hidden when online and fast.
 */
export function MobileConnectivityBanner({
    isOnline,
    isSlowConnection = false,
    lastUpdated,
    onRetry,
    className,
}: MobileConnectivityBannerProps) {
    if (isOnline && !isSlowConnection) return null;

    const lastUpdatedLabel = lastUpdated
        ? `Terakhir diperbarui ${lastUpdated.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`
        : null;

    return (
        <div
            role="status"
            aria-live="polite"
            className={cn(
                'flex min-h-11 items-center gap-2 border-b px-3 py-2 text-xs font-medium',
                !isOnline
                    ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-900'
                    : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-900',
                className,
            )}
        >
            {!isOnline ? (
                <>
                    <WifiOff aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                    <span>Tidak ada koneksi internet</span>
                </>
            ) : (
                <>
                    <RefreshCw aria-hidden="true" className="h-3.5 w-3.5 shrink-0 animate-spin" />
                    <span>Koneksi lambat terdeteksi</span>
                </>
            )}
            {lastUpdatedLabel && (
                <span className="ml-auto opacity-70">
                    {lastUpdatedLabel}
                </span>
            )}
            {onRetry && !isOnline && (
                <button
                    onClick={onRetry}
                    type="button"
                    className="ml-1 min-h-11 rounded bg-red-100 px-3 py-2 text-xs font-semibold transition-colors hover:bg-red-200 dark:bg-red-900 dark:hover:bg-red-800"
                >
                    Coba lagi
                </button>
            )}
        </div>
    );
}
