'use client';

import { useEffect, useState, useCallback } from 'react';
import { Maximize, Minimize } from 'lucide-react';
import { kioskLabels } from '@/lib/labels';
import { kioskButton } from '@/components/kiosk/ui/kiosk-button';

export function KioskFullscreenToggle() {
    const [isFullscreen, setIsFullscreen] = useState(false);

    useEffect(() => {
        const handler = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', handler);
        return () => document.removeEventListener('fullscreenchange', handler);
    }, []);

    const toggle = useCallback(() => {
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            document.documentElement.requestFullscreen().catch(() => {
                // ignore — some browsers block programmatic fullscreen
            });
        }
    }, []);

    const label = isFullscreen
        ? kioskLabels.fullscreenExit
        : kioskLabels.fullscreenEnter;

    return (
        <button
            type="button"
            onClick={toggle}
            aria-label={label}
            className={kioskButton({ tone: 'ghost' })}
        >
            {isFullscreen ? (
                <Minimize aria-hidden="true" />
            ) : (
                <Maximize aria-hidden="true" />
            )}
            <span className="hidden lg:inline">{label}</span>
        </button>
    );
}
