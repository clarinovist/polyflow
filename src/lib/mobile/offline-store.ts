/**
 * IndexedDB adapter for mobile offline queue.
 *
 * Stores queued commands in IndexedDB partitioned by tenantId:userId.
 * Falls back to in-memory storage if IndexedDB is unavailable (honest failure).
 *
 * @see docs/plan/2026-07-28-mobile-scope-strategy.md §6.6
 */

export type CommandStatus = 'QUEUED' | 'SYNCING' | 'FAILED' | 'COMPLETED';

export interface QueuedCommand<TPayload = unknown> {
    id: string;
    tenantId: string;
    userId: string;
    type: string;
    schemaVersion: number;
    payload: TPayload;
    createdAt: string;
    attempts: number;
    nextAttemptAt?: string;
    status: CommandStatus;
    lastError?: string;
}

const DB_NAME = 'polyflow-offline';
const DB_VERSION = 1;
const STORE_NAME = 'commands';

/**
 * Promise-based IndexedDB open.
 */
function openDBAsync(): Promise<IDBDatabase | null> {
    return new Promise((resolve) => {
        if (typeof indexedDB === 'undefined') {
            resolve(null);
            return;
        }
        try {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, {
                        keyPath: 'id',
                    });
                    store.createIndex('tenantUser', [
                        'tenantId',
                        'userId',
                    ]);
                    store.createIndex('status', ['status']);
                    store.createIndex('type', ['type']);
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
}

/**
 * In-memory fallback when IndexedDB is unavailable.
 * Data is lost on page refresh — this is the "honest failure" behavior.
 */
const memoryFallback = new Map<string, QueuedCommand>();

function memoryKey(cmd: QueuedCommand): string {
    return `${cmd.tenantId}:${cmd.userId}:${cmd.id}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Save (upsert) a command to the offline queue.
 */
export async function saveCommand<T>(
    command: QueuedCommand<T>,
): Promise<void> {
    const db = await openDBAsync();
    if (!db) {
        memoryFallback.set(memoryKey(command), command as QueuedCommand);
        return;
    }
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(command);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

/**
 * Get all commands for a specific tenant+user, optionally filtered by status.
 */
export async function getCommands(
    tenantId: string,
    userId: string,
    status?: CommandStatus,
): Promise<QueuedCommand[]> {
    const db = await openDBAsync();
    if (!db) {
        return Array.from(memoryFallback.values()).filter(
            (cmd) =>
                cmd.tenantId === tenantId &&
                cmd.userId === userId &&
                (!status || cmd.status === status),
        );
    }
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const index = store.index('tenantUser');
        const request = index.getAll([tenantId, userId]);
        request.onsuccess = () => {
            const results = request.result as QueuedCommand[];
            if (status) {
                resolve(results.filter((cmd) => cmd.status === status));
            } else {
                resolve(results);
            }
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * Get a single command by ID.
 */
export async function getCommand(
    id: string,
): Promise<QueuedCommand | null> {
    const db = await openDBAsync();
    if (!db) {
        for (const cmd of memoryFallback.values()) {
            if (cmd.id === id) return cmd;
        }
        return null;
    }
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Update a command (partial upsert).
 */
export async function updateCommand(
    id: string,
    updates: Partial<QueuedCommand>,
): Promise<void> {
    const existing = await getCommand(id);
    if (!existing) return;
    const merged = { ...existing, ...updates };
    const db = await openDBAsync();
    if (!db) {
        memoryFallback.set(memoryKey(merged), merged);
        return;
    }
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(merged);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

/**
 * Delete a command by ID.
 */
export async function deleteCommand(id: string): Promise<void> {
    const db = await openDBAsync();
    if (!db) {
        for (const [key, cmd] of memoryFallback.entries()) {
            if (cmd.id === id) {
                memoryFallback.delete(key);
            }
        }
        return;
    }
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

/**
 * Get count of commands by status for a tenant+user.
 */
export async function getCommandCounts(
    tenantId: string,
    userId: string,
): Promise<{ queued: number; syncing: number; failed: number }> {
    const commands = await getCommands(tenantId, userId);
    return {
        queued: commands.filter((c) => c.status === 'QUEUED').length,
        syncing: commands.filter((c) => c.status === 'SYNCING').length,
        failed: commands.filter((c) => c.status === 'FAILED').length,
    };
}

/**
 * Clear all commands for a specific tenant+user (e.g. on logout).
 */
export async function clearUserCommands(
    tenantId: string,
    userId: string,
): Promise<void> {
    const commands = await getCommands(tenantId, userId);
    const db = await openDBAsync();
    if (!db) {
        for (const cmd of commands) {
            memoryFallback.delete(memoryKey(cmd));
        }
        return;
    }
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        for (const cmd of commands) {
            store.delete(cmd.id);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}
