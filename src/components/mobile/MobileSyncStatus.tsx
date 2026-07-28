'use client';

import {
    CloudOff,
    Cloud,
    Loader2,
    AlertTriangle,
    RefreshCw,
    Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils/utils';
import type { QueuedCommand } from '@/lib/mobile/offline-store';

interface MobileSyncStatusProps {
    commands: QueuedCommand[];
    counts: { queued: number; syncing: number; failed: number };
    isSyncing: boolean;
    isOnline: boolean;
    onRetry?: (commandId: string) => void;
    onDiscard?: (commandId: string) => void;
    onSync?: () => void;
    className?: string;
}

/**
 * Sync status panel for mobile portals.
 * Shows queue summary, pending/failed commands, and sync controls.
 */
export function MobileSyncStatus({
    commands = [],
    counts = { queued: 0, syncing: 0, failed: 0 },
    isSyncing,
    isOnline,
    onRetry,
    onDiscard,
    onSync,
    className,
}: MobileSyncStatusProps) {
    const safeCounts = counts ?? { queued: 0, syncing: 0, failed: 0 };
    const safeCommands = Array.isArray(commands) ? commands : [];
    const hasQueue = safeCounts.queued + safeCounts.syncing + safeCounts.failed > 0;

    if (!hasQueue) return null;

    const failedCommands = safeCommands.filter((c) => c.status === 'FAILED');

    return (
        <div
            className={cn(
                'rounded-lg border border-border bg-card p-3 space-y-3',
                className,
            )}
        >
            {/* Summary row */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {isOnline ? (
                        <Cloud className="h-4 w-4 text-green-500" />
                    ) : (
                        <CloudOff className="h-4 w-4 text-red-500" />
                    )}
                    <span className="text-xs font-medium text-foreground">
                        {isOnline ? 'Online' : 'Offline'}
                    </span>
                    {isSyncing && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                    )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {counts.queued > 0 && (
                        <span>{counts.queued} antrian</span>
                    )}
                    {counts.failed > 0 && (
                        <span className="text-red-500">
                            {counts.failed} gagal
                        </span>
                    )}
                    {onSync && isOnline && counts.queued > 0 && !isSyncing && (
                        <button
                            onClick={onSync}
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                        >
                            <RefreshCw className="h-3 w-3" />
                            Sync
                        </button>
                    )}
                </div>
            </div>

            {/* Failed commands list */}
            {failedCommands.length > 0 && (
                <div className="space-y-2">
                    <p className="text-xs font-medium text-red-600 dark:text-red-400">
                        Perlu perhatian:
                    </p>
                    {failedCommands.map((cmd) => (
                        <div
                            key={cmd.id}
                            className="flex items-start gap-2 p-2 rounded bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900"
                        >
                            <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-red-700 dark:text-red-400">
                                    {cmd.type}
                                </p>
                                {cmd.lastError && (
                                    <p className="text-[10px] text-red-600/70 dark:text-red-400/70 mt-0.5 truncate">
                                        {cmd.lastError}
                                    </p>
                                )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                {onRetry && (
                                    <button
                                        onClick={() => onRetry(cmd.id)}
                                        className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900 transition-colors"
                                        title="Coba lagi"
                                    >
                                        <RefreshCw className="h-3 w-3 text-red-600" />
                                    </button>
                                )}
                                {onDiscard && (
                                    <button
                                        onClick={() => onDiscard(cmd.id)}
                                        className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900 transition-colors"
                                        title="Buang"
                                    >
                                        <Trash2 className="h-3 w-3 text-red-600" />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
