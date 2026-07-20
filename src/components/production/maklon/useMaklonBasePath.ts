'use client';

import { usePathname } from 'next/navigation';

const MAKLON_BASE_PATHS = ['/maklon', '/warehouse/maklon', '/dashboard/maklon'] as const;

/**
 * Returns the Maklon base path based on the current URL.
 * - Portal Maklon users stay in /maklon
 * - Warehouse users stay in /warehouse/maklon (warehouse layout)
 * - Legacy /dashboard/maklon redirects to /maklon
 */
export function useMaklonBasePath(): string {
    const pathname = usePathname();

    for (const basePath of MAKLON_BASE_PATHS) {
        if (pathname.startsWith(basePath)) {
            return basePath;
        }
    }

    return '/maklon';
}
