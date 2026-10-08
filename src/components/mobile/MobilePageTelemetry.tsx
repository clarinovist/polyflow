'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { trackMobilePageView } from '@/lib/analytics/mobile-task-events';

export function MobilePageTelemetry({ portalId }: { portalId: string }) {
    const pathname = usePathname();
    useEffect(() => {
        void trackMobilePageView(pathname, portalId);
    }, [pathname, portalId]);
    return null;
}
