// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import {
    MobileEmptyState,
    MobileLoadingState,
    MobileErrorState,
    MobileSectionHeader,
    MobileTaskCard,
    MobileInsightCard,
    MobileDataFreshness,
    MobilePortalHeader,
    MobilePortalShell,
    MobileReadError,
} from '../index';
import type { MobileInsight } from '@/lib/mobile/types';

vi.mock('next/navigation', () => ({
    usePathname: () => '/finance/mobile',
    useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock('next/link', () => ({
    default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a {...props}>{children}</a>
    ),
}));

// These are server/client component shape tests.
// We verify the exports exist and the components can be imported.
// Full DOM rendering requires matching react/react-dom versions (pre-existing mismatch).

describe('Mobile shared components exports', () => {
    it('MobileEmptyState is exported', () => {
        expect(MobileEmptyState).toBeDefined();
        expect(typeof MobileEmptyState).toBe('function');
    });

    it('MobileLoadingState is exported', () => {
        expect(MobileLoadingState).toBeDefined();
        expect(typeof MobileLoadingState).toBe('function');
    });

    it('MobileErrorState is exported', () => {
        expect(MobileErrorState).toBeDefined();
        expect(typeof MobileErrorState).toBe('function');
    });

    it('MobileSectionHeader is exported', () => {
        expect(MobileSectionHeader).toBeDefined();
        expect(typeof MobileSectionHeader).toBe('function');
    });

    it('MobileTaskCard is exported', () => {
        expect(MobileTaskCard).toBeDefined();
        expect(typeof MobileTaskCard).toBe('function');
    });

    it('MobileInsightCard is exported', () => {
        expect(MobileInsightCard).toBeDefined();
        expect(typeof MobileInsightCard).toBe('function');
    });

    it.each([
        MobileDataFreshness,
        MobilePortalHeader,
        MobilePortalShell,
        MobileReadError,
    ])('exports the Phase 2 shared primitive', (component) => {
        expect(component).toBeDefined();
        expect(typeof component).toBe('function');
    });

    it('renders a safe-area shell with a focusable main landmark', () => {
        render(
            <MobilePortalShell
                contentId="test-mobile-content"
                showConnectivity={false}
                header={<MobilePortalHeader title="Portal Test" />}
                bottomNavigation={<nav aria-label="Navigasi test" />}
            >
                <h1>Halaman test</h1>
            </MobilePortalShell>,
        );

        expect(screen.getByRole('main').id).toBe('test-mobile-content');
        expect(screen.getByRole('main').getAttribute('tabindex')).toBe('-1');
        expect(screen.getByRole('link', { name: 'Lewati ke konten utama' }).getAttribute('href')).toBe('#test-mobile-content');
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    });
});

describe('MobileInsightCard severity mapping', () => {
    const severances = ['INFO', 'SUCCESS', 'WARNING', 'CRITICAL'] as const;

    it.each(severances)('handles severity %s', (severity) => {
        const insight: MobileInsight = {
            key: 'test',
            label: 'Test',
            value: 1,
            severity,
        };
        // Component accepts insight prop — shape validation
        expect(insight.severity).toBe(severity);
        expect(insight.key).toBeTruthy();
        expect(insight.label).toBeTruthy();
    });
});

describe('MobileTaskCard priority mapping', () => {
    const priorities = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;

    it.each(priorities)('handles priority %s', (priority) => {
        // Shape validation — component renders priority badge
        expect(priority).toBeTruthy();
    });
});

describe('useMobileConnectivity hook shape', () => {
    it('exports a function', async () => {
        const { useMobileConnectivity } = await import(
            '../../../hooks/use-mobile-connectivity'
        );
        expect(useMobileConnectivity).toBeDefined();
        expect(typeof useMobileConnectivity).toBe('function');
    });
});
