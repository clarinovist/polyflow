'use client';

import { useMobileConnectivity } from '@/hooks/use-mobile-connectivity';
import { MobileConnectivityBanner } from './MobileConnectivityBanner';

/** Browser network signals only; does not claim that dashboard data is fresh. */
export function LiveMobileConnectivity() {
    const { isOnline, isSlowConnection } = useMobileConnectivity();
    return <MobileConnectivityBanner isOnline={isOnline} isSlowConnection={isSlowConnection} />;
}
