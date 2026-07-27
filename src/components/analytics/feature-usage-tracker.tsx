'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { resolveFeatureFromPath } from '@/lib/analytics/feature-registry';

const SESSION_STORAGE_KEY = 'pf_analytics_session_id';

function getOrCreateSessionId(): string {
    if (typeof window === 'undefined') return 'server-session';
    try {
        let sid = sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (!sid) {
            sid = typeof crypto !== 'undefined' && crypto.randomUUID
                ? crypto.randomUUID()
                : `sess_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
            sessionStorage.setItem(SESSION_STORAGE_KEY, sid);
        }
        return sid;
    } catch {
        return 'fallback-session';
    }
}

export function FeatureUsageTracker() {
    const pathname = usePathname();
    const { data: session, status } = useSession();
    const lastTrackedKeyRef = useRef<string | null>(null);
    const activeUserIdRef = useRef<string | null>(null);

    // Clean session ID on signout or user change (Fix 3)
    useEffect(() => {
        if (status === 'unauthenticated') {
            try {
                sessionStorage.removeItem(SESSION_STORAGE_KEY);
            } catch {
                // Ignore storage errors
            }
            lastTrackedKeyRef.current = null;
            activeUserIdRef.current = null;
        } else if (session?.user?.id && activeUserIdRef.current !== session.user.id) {
            if (activeUserIdRef.current !== null) {
                try {
                    sessionStorage.removeItem(SESSION_STORAGE_KEY);
                } catch {
                    // Ignore storage errors
                }
            }
            activeUserIdRef.current = session.user.id;
            lastTrackedKeyRef.current = null;
        }
    }, [status, session]);

    useEffect(() => {
        // Fix 2: Only track when user is actively authenticated
        if (status !== 'authenticated' || !session?.user?.id || !pathname) return;

        const resolved = resolveFeatureFromPath(pathname);
        if (!resolved) return;

        const trackKey = `${pathname}::${resolved.featureKey}`;
        if (lastTrackedKeyRef.current === trackKey) {
            return;
        }

        const sessionId = getOrCreateSessionId();
        const payload = {
            pathname,
            sessionId,
        };

        const endpoint = '/api/analytics/track';
        let queuedSuccessfully = false;

        try {
            if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
                const blob = new Blob([JSON.stringify(payload)], {
                    type: 'application/json',
                });
                queuedSuccessfully = navigator.sendBeacon(endpoint, blob);
            }
        } catch {
            queuedSuccessfully = false;
        }

        if (!queuedSuccessfully) {
            try {
                fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    keepalive: true,
                })
                    .then((res) => {
                        if (res.ok) {
                            lastTrackedKeyRef.current = trackKey;
                        }
                    })
                    .catch(() => {
                        // Silent catch
                    });
            } catch {
                // Silent catch
            }
        } else {
            lastTrackedKeyRef.current = trackKey;
        }
    }, [pathname, status, session]);

    return null;
}
