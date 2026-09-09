'use client';

import { useSearchParams } from 'next/navigation';
import {
    resolvePartnerTab,
    type PartnerDetailTabGroup,
} from './PartnerDetailTabs';

export function usePartnerDetailTab(
    groups: PartnerDetailTabGroup[],
    initialTab = 'overview',
) {
    const searchParams = useSearchParams();
    const activeTab = resolvePartnerTab(
        groups,
        searchParams === null ? initialTab : searchParams.get('tab'),
    );

    function selectTab(value: string) {
        const tab = resolvePartnerTab(groups, value);
        if (tab === activeTab) return;
        const url = new URL(window.location.href);
        url.searchParams.set('tab', tab);
        // Next's native History integration updates useSearchParams without re-fetching
        // the page's data. Back/Forward and existing leaf-value links remain supported.
        window.history.pushState(
            null,
            '',
            url.pathname + url.search + url.hash,
        );
    }

    return [activeTab, selectTab] as const;
}
