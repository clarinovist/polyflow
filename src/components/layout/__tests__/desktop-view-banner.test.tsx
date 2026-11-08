// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pathnameMock = vi.hoisted(() => ({ value: '/dashboard' }));
const assignMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
    usePathname: () => pathnameMock.value,
}));

import { DesktopViewBanner } from '../desktop-view-banner';

function clearCookie() {
    document.cookie = 'bypass_mobile=; path=/; max-age=0';
}

describe('DesktopViewBanner', () => {
    beforeEach(() => {
        clearCookie();
        pathnameMock.value = '/dashboard';
        vi.stubGlobal('location', {
            protocol: 'https:',
            assign: assignMock,
        });
        assignMock.mockClear();
    });

    afterEach(() => {
        clearCookie();
        vi.unstubAllGlobals();
    });

    it('stays hidden when the desktop view cookie is not set', () => {
        render(<DesktopViewBanner />);

        expect(screen.queryByText('Kembali ke mobile')).toBeNull();
    });

    it('shows a way back on a desktop page while the cookie is active', () => {
        document.cookie = 'bypass_mobile=true; path=/';
        render(<DesktopViewBanner />);

        expect(
            screen.getByRole('button', { name: 'Kembali ke mobile' }),
        ).toBeTruthy();
    });

    it('stays hidden on mobile surfaces even with the cookie', () => {
        document.cookie = 'bypass_mobile=true; path=/';
        pathnameMock.value = '/mobile/admin';
        render(<DesktopViewBanner />);

        expect(screen.queryByText('Kembali ke mobile')).toBeNull();
    });

    it('clears the cookie and returns to the mobile home on tap', () => {
        document.cookie = 'bypass_mobile=true; path=/';
        render(<DesktopViewBanner />);

        fireEvent.click(
            screen.getByRole('button', { name: 'Kembali ke mobile' }),
        );

        expect(document.cookie).not.toContain('bypass_mobile=true');
        expect(assignMock).toHaveBeenCalledWith('/mobile');
    });
});
