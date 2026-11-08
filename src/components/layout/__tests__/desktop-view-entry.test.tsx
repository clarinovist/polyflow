// @vitest-environment jsdom
import type { AnchorHTMLAttributes } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MobileAccountMenu } from '../mobile-account-menu';
import { DesktopRequiredClient } from '@/app/device/desktop-required/DesktopRequiredClient';

const assignMock = vi.hoisted(() => vi.fn());
const sessionMock = vi.hoisted(() => ({
    value: { user: { role: 'ADMIN', roles: ['ADMIN'] } } as {
        user?: { role?: string; roles?: string[] };
    } | null,
}));
const fromMock = vi.hoisted(() => ({ value: '/finance/reports' as string | null }));

vi.mock('next/link', () => ({
    default: ({
        href,
        children,
        ...props
    }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));
vi.mock('next-auth/react', () => ({
    signOut: vi.fn(),
    useSession: () => ({ data: sessionMock.value }),
}));
vi.mock('next/navigation', () => ({
    useSearchParams: () => ({ get: () => fromMock.value }),
}));

function installMemoryStorage() {
    const store = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: {
            getItem: (key: string) => store.get(key) ?? null,
            setItem: (key: string, value: string) => void store.set(key, value),
            removeItem: (key: string) => void store.delete(key),
        },
    });
}

beforeEach(() => {
    document.cookie = 'bypass_mobile=; path=/; max-age=0';
    installMemoryStorage();
    vi.stubGlobal('location', { protocol: 'https:', assign: assignMock });
    assignMock.mockClear();
    sessionMock.value = { user: { role: 'ADMIN', roles: ['ADMIN'] } };
    fromMock.value = '/finance/reports';
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe('account menu desktop shortcut', () => {
    it('shows the desktop shortcut only when the caller allows it', () => {
        const user = { name: 'Synthetic User', role: 'ADMIN' };
        render(<MobileAccountMenu user={user} />);
        fireEvent.click(screen.getByRole('button', { name: /Menu akun/ }));
        expect(screen.queryByText('Buka versi desktop')).toBeNull();

        cleanup();
        render(<MobileAccountMenu user={user} canUseDesktopView />);
        fireEvent.click(screen.getByRole('button', { name: /Menu akun/ }));
        fireEvent.click(screen.getByText('Buka versi desktop'));

        expect(document.cookie).toContain('bypass_mobile=true');
        expect(assignMock).toHaveBeenCalledWith('/dashboard');
    });
});

describe('desktop-required page', () => {
    it('lets an admin pick a longer duration and opens the original page', () => {
        render(<DesktopRequiredClient />);

        fireEvent.click(screen.getByRole('radio', { name: '7 hari' }));
        fireEvent.click(
            screen.getByRole('button', { name: /Buka versi desktop \(7 hari\)/ }),
        );

        expect(assignMock).toHaveBeenCalledWith('/finance/reports');
        expect(window.localStorage.getItem('polyflow.desktopViewDays')).toBe('7');
    });

    it('hides the desktop option for non-admin users', () => {
        sessionMock.value = { user: { role: 'SALES', roles: ['SALES'] } };
        render(<DesktopRequiredClient />);

        expect(screen.queryByRole('radio', { name: '7 hari' })).toBeNull();
        expect(screen.queryByText(/Buka versi desktop/)).toBeNull();
    });

    it('ignores an external redirect target', () => {
        fromMock.value = 'https://evil.example/phish';
        render(<DesktopRequiredClient />);

        fireEvent.click(
            screen.getByRole('button', { name: /Buka versi desktop/ }),
        );

        expect(assignMock).toHaveBeenCalledWith('/dashboard');
    });
});
