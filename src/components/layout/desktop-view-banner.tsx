'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Smartphone } from 'lucide-react';
import { getMobileAllowlistPrefixes } from '@/lib/mobile/mobile-static-policy';
import {
    disableDesktopView,
    isDesktopViewActive,
} from '@/lib/mobile/desktop-view';

const PUBLIC_PREFIXES = ['/login', '/logout', '/register', '/device'];

function isMobileSurface(pathname: string): boolean {
    return [...getMobileAllowlistPrefixes(), ...PUBLIC_PREFIXES].some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
}

/**
 * Jalan pulang untuk ADMIN yang membuka versi desktop di HP: muncul hanya
 * saat cookie bypass aktif, di layar kecil, dan bukan di layar mobile.
 */
export function DesktopViewBanner() {
    const pathname = usePathname();
    const [active, setActive] = useState(false);

    useEffect(() => {
        setActive(isDesktopViewActive());
    }, [pathname]);

    if (!active || !pathname || isMobileSurface(pathname)) return null;

    return (
        <button
            type="button"
            onClick={disableDesktopView}
            className="fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-3 z-40 inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-xs font-semibold text-foreground shadow-md transition-transform active:scale-[0.97] lg:hidden print:hidden"
        >
            <Smartphone aria-hidden="true" className="h-4 w-4" />
            Kembali ke mobile
        </button>
    );
}
