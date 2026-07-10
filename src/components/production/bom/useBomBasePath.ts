'use client';

import { usePathname } from 'next/navigation';

const BOM_BASE_PATHS = ['/production/boms', '/dashboard/boms'] as const;

/**
 * Returns the BOM base path based on the current URL.
 * Production users stay in /production/boms (production layout),
 * Master Data users stay in /dashboard/boms (dashboard layout).
 */
export function useBomBasePath(): string {
    const pathname = usePathname();

    for (const basePath of BOM_BASE_PATHS) {
        if (pathname.startsWith(basePath)) {
            return basePath;
        }
    }

    // Fallback to master path
    return '/dashboard/boms';
}
