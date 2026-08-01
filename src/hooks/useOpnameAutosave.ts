import { useCallback, useEffect, useRef, useState } from 'react';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface UseOpnameAutosaveOptions {
    enabled?: boolean;
    delayMs?: number;
}

export function useOpnameAutosave<T>(
    dirtyPayload: T,
    saveFn: (payload: T) => Promise<void>,
    options: UseOpnameAutosaveOptions = {},
) {
    const { enabled = true, delayMs = 2500 } = options;

    const [status, setStatus] = useState<AutosaveStatus>('idle');
    const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isSavingRef = useRef(false);
    const pendingRef = useRef(false);
    const payloadRef = useRef(dirtyPayload);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const runSave = useCallback(
        async (payload: NonNullable<T>) => {
            isSavingRef.current = true;
            setStatus('saving');
            try {
                await saveFn(payload);
                if (mountedRef.current) {
                    setStatus('saved');
                    setLastSavedAt(new Date());
                }
            } catch {
                if (mountedRef.current) {
                    setStatus('error');
                }
            } finally {
                isSavingRef.current = false;

                if (mountedRef.current && pendingRef.current) {
                    pendingRef.current = false;
                    if (payloadRef.current != null) {
                        runSave(payloadRef.current);
                    }
                }
            }
        },
        [saveFn],
    );

    const clearTimer = useCallback(() => {
        if (timerRef.current !== null) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const flush = useCallback(() => {
        clearTimer();
        if (!enabled) return;
        if (dirtyPayload == null) return;
        if (isSavingRef.current) {
            pendingRef.current = true;
            return;
        }
        runSave(dirtyPayload);
    }, [clearTimer, enabled, dirtyPayload, runSave]);

    useEffect(() => {
        payloadRef.current = dirtyPayload;
    }, [dirtyPayload]);

    useEffect(() => {
        if (!enabled) return;
        if (dirtyPayload == null) return;

        clearTimer();
        timerRef.current = setTimeout(() => {
            if (!isSavingRef.current) {
                runSave(dirtyPayload);
            } else {
                pendingRef.current = true;
            }
        }, delayMs);

        return clearTimer;
    }, [dirtyPayload, enabled, delayMs, clearTimer, runSave]);

    useEffect(() => {
        return () => {
            clearTimer();
        };
    }, [clearTimer]);

    return { status, lastSavedAt, flush } as const;
}
