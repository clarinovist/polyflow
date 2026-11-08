'use client';

import { useEffect, useState } from 'react';
import { Monitor } from 'lucide-react';
import {
    DEFAULT_DESKTOP_VIEW_DAYS,
    DESKTOP_VIEW_DEFAULT_PATH,
    desktopViewLabel,
    enableDesktopView,
    getPreferredDesktopViewDays,
} from '@/lib/mobile/desktop-view';
import { cn } from '@/lib/utils/utils';

/**
 * Pintasan satu ketukan ke tampilan desktop untuk ADMIN. Pemanggil yang
 * memutuskan siapa boleh melihatnya (isMobileBypassAllowed); gerbang server
 * tetap memeriksa peran saat cookie dipakai.
 */
export function DesktopViewButton({
    className,
    target = DESKTOP_VIEW_DEFAULT_PATH,
}: {
    className?: string;
    target?: string;
}) {
    // Server render memakai default; preferensi tersimpan dibaca setelah mount.
    const [days, setDays] = useState(DEFAULT_DESKTOP_VIEW_DAYS);
    useEffect(() => {
        setDays(getPreferredDesktopViewDays());
    }, []);

    const handleClick = () => {
        enableDesktopView(days, target);
    };

    return (
        <button
            type="button"
            onClick={handleClick}
            className={cn(
                'flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent/50 active:scale-[0.98]',
                className,
            )}
        >
            <Monitor aria-hidden="true" className="h-4 w-4" />
            Buka versi desktop
            <span className="text-xs font-normal text-muted-foreground">
                ({desktopViewLabel(days)})
            </span>
        </button>
    );
}
