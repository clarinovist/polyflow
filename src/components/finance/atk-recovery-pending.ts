'use client';

import { useSyncExternalStore } from 'react';
import { ValidationError } from '@/lib/errors/errors';
import { atkRecoveryApplySchema } from '@/lib/schemas/atk-recovery';
import type { AtkRecoveryApply } from '@/types/atk-recovery';

const eventName = 'atk-recovery-pending-changed';
const key = (scope: string) => `atk-recovery:v1:${scope}`;
function subscribe(callback: () => void) {
    window.addEventListener(eventName, callback);
    window.addEventListener('storage', callback);
    return () => { window.removeEventListener(eventName, callback); window.removeEventListener('storage', callback); };
}
export function usePendingAtkRecovery(scope: string) {
    const raw = useSyncExternalStore(subscribe, () => {
        try { return sessionStorage.getItem(key(scope)); } catch { return null; }
    }, () => null);
    let request: AtkRecoveryApply | null = null;
    if (raw) {
        try { const parsed = atkRecoveryApplySchema.safeParse(JSON.parse(raw)); if (parsed.success) request = parsed.data; } catch { /* Keep malformed state locked for manual recovery. */ }
    }
    return { request, blocked: raw !== null };
}
/** Must succeed before dispatch; storage failure is not permission to lose the receipt key. */
export function savePendingAtkRecovery(scope: string, request: AtkRecoveryApply) {
    const raw = JSON.stringify(request);
    sessionStorage.setItem(key(scope), raw);
    if (sessionStorage.getItem(key(scope)) !== raw) throw new ValidationError('Request persistence unavailable');
    window.dispatchEvent(new Event(eventName));
}
export function clearPendingAtkRecovery(scope: string, requestId: string) {
    const storageKey = key(scope);
    try {
        const raw = sessionStorage.getItem(storageKey);
        if (raw) {
            let savedId: unknown;
            let unreadable = false;
            try {
                savedId = (JSON.parse(raw) as { requestId?: unknown } | null)
                    ?.requestId;
            } catch {
                unreadable = true;
            }
            // An unreadable key cannot be confirmed against a committed
            // correction; drop it instead of reporting "status unknown"
            // forever after a successful apply.
            if (unreadable || savedId === requestId) {
                sessionStorage.removeItem(storageKey);
            }
        }
    } catch {
        // Storage is unavailable. The correction already committed; cleanup
        // must not turn the success path into an uncertain result.
    }
    window.dispatchEvent(new Event(eventName));
}
