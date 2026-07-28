'use client';

import { useState, useEffect, useCallback } from 'react';

export interface ConnectivityState {
    isOnline: boolean;
    isSlowConnection: boolean;
    lastUpdated: Date | null;
    retry: () => void;
}

/**
 * Hook to track browser online/offline connectivity.
 * Provides connectivity state and a retry function for failed operations.
 */
export function useMobileConnectivity(): ConnectivityState {
    const [isOnline, setIsOnline] = useState(
        typeof navigator !== 'undefined' ? navigator.onLine : true,
    );
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [isSlowConnection, setIsSlowConnection] = useState(false);

    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            setLastUpdated(new Date());
        };

        const handleOffline = () => {
            setIsOnline(false);
            setLastUpdated(new Date());
        };

        // Check connection speed if available
        const checkConnectionSpeed = () => {
            const conn = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection;
            if (conn?.effectiveType) {
                setIsSlowConnection(
                    conn.effectiveType === 'slow-2g' ||
                        conn.effectiveType === '2g',
                );
            }
        };

        setIsOnline(navigator.onLine);
        checkConnectionSpeed();

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Check connection speed periodically
        const interval = setInterval(checkConnectionSpeed, 5000);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            clearInterval(interval);
        };
    }, []);

    const retry = useCallback(() => {
        setLastUpdated(new Date());
    }, []);

    return { isOnline, isSlowConnection, lastUpdated, retry };
}
