'use client';

import { usePathname } from 'next/navigation';

const MAKLON_BASE_PATHS = ['/warehouse/maklon', '/dashboard/maklon'] as const;

/**
 * Returns the Maklon base path based on the current URL.
 * Warehouse users stay in /warehouse/maklon (warehouse layout),
 * Admin/master users stay in /dashboard/maklon (dashboard layout).
 */
export function useMaklonBasePath(): string {
    const pathname = usePathname();

    for (const basePath of MAKLON_BASE_PATHS) {
        if (pathname.startsWith(basePath)) {
            return basePath;
        }
    }

    return '/dashboard/maklon';
}
