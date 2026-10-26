'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { kioskLabels } from '@/lib/labels';
import { kioskButton } from './ui/kiosk-button';

interface UseKioskIdleSessionOptions {
    timeoutMs?: number;
    warningMs?: number;
    onIdle?: () => void;
}

export function useKioskIdleSession({
    timeoutMs = 15 * 60 * 1000, // 15 minutes
    warningMs = 60 * 1000, // 60 seconds before logout
    onIdle,
}: UseKioskIdleSessionOptions = {}) {
    const [showWarning, setShowWarning] = useState(false);
    const [timeLeft, setTimeLeft] = useState(warningMs / 1000);
    const [lastActivity, setLastActivity] = useState(Date.now());

    // Keep latest onIdle without re-creating the interval each render
    const onIdleRef = useRef(onIdle);
    useEffect(() => {
        onIdleRef.current = onIdle;
    }, [onIdle]);

    const resetTimer = useCallback(() => {
        setLastActivity(Date.now());
        setShowWarning(false);
        setTimeLeft(warningMs / 1000);
    }, [warningMs]);

    // Track user activity
    useEffect(() => {
        const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
        const handler = () => resetTimer();

        events.forEach((event) =>
            window.addEventListener(event, handler, { passive: true }),
        );
        return () =>
            events.forEach((event) =>
                window.removeEventListener(event, handler),
            );
    }, [resetTimer]);

    // Main idle timer — stable deps only (no showWarning / onIdle identity churn)
    useEffect(() => {
        const interval = setInterval(() => {
            const elapsed = Date.now() - lastActivity;
            const remaining = timeoutMs - elapsed;

            if (remaining <= 0) {
                clearInterval(interval);
                onIdleRef.current?.();
                // Start over so the warning does not stay stuck at 1 second.
                resetTimer();
                return;
            }

            if (remaining <= warningMs) {
                setShowWarning(true);
                setTimeLeft(Math.ceil(remaining / 1000));
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [lastActivity, timeoutMs, warningMs, resetTimer]);

    return {
        showWarning,
        timeLeft,
        resetTimer,
        dismissWarning: () => {
            resetTimer();
        },
    };
}

interface KioskIdleWarningProps {
    timeLeft: number;
    onDismiss: () => void;
}

export function KioskIdleWarning({
    timeLeft,
    onDismiss,
}: KioskIdleWarningProps) {
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4">
            <div
                role="alertdialog"
                aria-labelledby="kiosk-idle-title"
                className="grid w-full max-w-md gap-4 rounded-2xl border-2 border-kiosk-warn bg-card p-8 text-center shadow-2xl"
            >
                <span className="mx-auto flex size-20 items-center justify-center rounded-full bg-kiosk-warn-soft text-4xl font-extrabold tabular-nums text-kiosk-warn-ink">
                    {timeLeft}
                </span>
                <h2 id="kiosk-idle-title" className="text-2xl font-extrabold">
                    {kioskLabels.idleTitle}
                </h2>
                <p className="text-lg text-muted-foreground">
                    {kioskLabels.idleDesc} {timeLeft} {kioskLabels.idleSeconds}.
                </p>
                <button
                    type="button"
                    className={kioskButton({ size: 'xl', tone: 'go' })}
                    onClick={onDismiss}
                >
                    {kioskLabels.idleContinue}
                </button>
            </div>
        </div>
    );
}
