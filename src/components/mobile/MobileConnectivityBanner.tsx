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
            className={cn(
                'flex items-center gap-2 px-3 py-2 text-xs font-medium border-b',
                !isOnline
                    ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-900'
                    : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-900',
                className,
            )}
        >
            {!isOnline ? (
                <>
                    <WifiOff className="h-3.5 w-3.5 shrink-0" />
                    <span>Tidak ada koneksi internet</span>
                </>
            ) : (
                <>
                    <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin" />
                    <span>Koneksi lambat terdeteksi</span>
                </>
            )}
            {lastUpdatedLabel && (
                <span className="ml-auto text opacity-70">
                    {lastUpdatedLabel}
                </span>
            )}
            {onRetry && !isOnline && (
                <button
                    onClick={onRetry}
                    className="ml-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-100 hover:bg-red-200 dark:bg-red-900 dark:hover:bg-red-800 transition-colors"
                >
                    Coba lagi
                </button>
            )}
        </div>
    );
}
