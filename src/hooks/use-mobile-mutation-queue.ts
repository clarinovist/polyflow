'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    saveCommand,
    getCommands,
    getCommandCounts,
    type QueuedCommand,
} from '@/lib/mobile/offline-store';
import { initializeOfflineCommands, getCommandDef } from '@/lib/mobile/offline-command-registry';
import { processSyncQueue, retryFailedCommand, discardFailedCommand } from '@/lib/mobile/offline-sync';

export interface MutationQueueState {
    /** Commands currently in the queue */
    commands: QueuedCommand[];
    /** Count by status */
    counts: { queued: number; syncing: number; failed: number };
    /** Whether a sync is currently in progress */
    isSyncing: boolean;
    /** Whether the device is online */
    isOnline: boolean;
    /** Queue a command for offline execution */
    enqueue: (type: string, payload: unknown) => Promise<string>;
    /** Manually trigger sync */
    sync: () => Promise<void>;
    /** Retry a failed command */
    retry: (commandId: string) => Promise<void>;
    /** Discard a failed command */
    discard: (commandId: string) => Promise<void>;
    /** Refresh the command list */
    refresh: () => Promise<void>;
}

/**
 * Hook to manage the offline mutation queue.
 * Partitions by tenantId:userId, auto-syncs when online.
 */
export function useMobileMutationQueue(
    tenantId: string,
    userId: string,
): MutationQueueState {
    const [commands, setCommands] = useState<QueuedCommand[]>([]);
    const [counts, setCounts] = useState({ queued: 0, syncing: 0, failed: 0 });
    const [isSyncing, setIsSyncing] = useState(false);
    const [isOnline, setIsOnline] = useState(
        typeof navigator !== 'undefined' ? navigator.onLine : true,
    );

    // Initialize command registry on mount
    useEffect(() => {
        initializeOfflineCommands();
    }, []);

    const refresh = useCallback(async () => {
        const all = await getCommands(tenantId, userId);
        setCommands(all);
        const c = await getCommandCounts(tenantId, userId);
        setCounts(c);
    }, [tenantId, userId]);

    // Load initial state
    useEffect(() => {
        refresh();
    }, [refresh]);

    // Track online/offline
    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        setIsOnline(navigator.onLine);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // Auto-sync when coming back online
    useEffect(() => {
        if (isOnline && !isSyncing && counts.queued > 0) {
            sync();
        }
        // Only trigger on isOnline change
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOnline]);

    const enqueue = useCallback(
        async (type: string, payload: unknown): Promise<string> => {
            const def = getCommandDef(type);
            if (!def) throw new Error(`Unknown command type: ${type}`);

            if (!def.validate(payload)) {
                throw new Error(`Invalid payload for command: ${type}`);
            }

            const id = crypto.randomUUID();
            const command: QueuedCommand = {
                id,
                tenantId,
                userId,
                type,
                schemaVersion: 1,
                payload,
                createdAt: new Date().toISOString(),
                attempts: 0,
                status: 'QUEUED',
            };

            await saveCommand(command);
            await refresh();
            return id;
        },
        [tenantId, userId, refresh],
    );

    const sync = useCallback(async () => {
        if (isSyncing) return;
        setIsSyncing(true);
        try {
            await processSyncQueue(tenantId, userId);
        } finally {
            setIsSyncing(false);
            await refresh();
        }
    }, [tenantId, userId, isSyncing, refresh]);

    const retry = useCallback(
        async (commandId: string) => {
            await retryFailedCommand(commandId);
            await refresh();
        },
        [refresh],
    );

    const discard = useCallback(
        async (commandId: string) => {
            await discardFailedCommand(commandId);
            await refresh();
        },
        [refresh],
    );

    return {
        commands,
        counts,
        isSyncing,
        isOnline,
        enqueue,
        sync,
        retry,
        discard,
        refresh,
    };
}
