'use client';

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useKioskIdleSession, KioskIdleWarning } from "@/components/kiosk/KioskIdleSession";

interface KioskIdleShellProps {
    children: React.ReactNode;
}

export function KioskIdleShell({ children }: KioskIdleShellProps) {
    const router = useRouter();

    const handleIdle = useCallback(() => {
        sessionStorage.removeItem('kiosk_operator_id');
        router.push('/kiosk');
    }, [router]);

    const { showWarning, timeLeft, dismissWarning } = useKioskIdleSession({
        timeoutMs: 15 * 60 * 1000, // 15 minutes
        warningMs: 60 * 1000, // 60 seconds warning
        onIdle: handleIdle,
    });

    return (
        <>
            {children}
            {showWarning && (
                <KioskIdleWarning timeLeft={timeLeft} onDismiss={dismissWarning} />
            )}
        </>
    );
}
