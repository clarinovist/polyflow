'use client';

import { useEffect, useRef, useCallback } from 'react';
import { signOut, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface SessionTimeoutHandlerProps {
    timeoutMs?: number; // Timeout in milliseconds
}

export default function SessionTimeoutHandler({
    timeoutMs = 30 * 60 * 1000 // Default 30 minutes
}: SessionTimeoutHandlerProps) {
    const { status } = useSession();
    const router = useRouter();
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    const handleLogout = useCallback(async () => {
        console.log('Session inactive. Signing out...');
        await signOut({ redirect: false });
        router.push('/login?reason=timeout');
        router.refresh();
    }, [router]);

    const resetTimer = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
        }

        if (status === 'authenticated') {
            timerRef.current = setTimeout(handleLogout, timeoutMs);
        }
    }, [status, timeoutMs, handleLogout]);

    useEffect(() => {
        // Events to monitor for activity
        const events = [
            'mousedown',
            'mousemove',
            'keypress',
            'scroll',
            'touchstart',
            'click'
        ];

        if (status === 'authenticated') {
            // Set initial timer
            resetTimer();

            // Add event listeners
            events.forEach(event => {
                window.addEventListener(event, resetTimer);
            });
        }

        return () => {
            // Cleanup
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
            events.forEach(event => {
                window.removeEventListener(event, resetTimer);
            });
        };
    }, [status, resetTimer]);

    return null; // This component doesn't render anything
}
