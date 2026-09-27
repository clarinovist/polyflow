// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginClient from '@/app/login/client';

vi.mock('framer-motion', () => ({
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: {
        div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
            <div {...props}>{children}</div>
        ),
    },
}));

vi.mock('@/actions/auth/auth.actions', () => ({
    authenticate: vi.fn(),
}));
vi.mock('@/actions/auth/central-sso.actions', () => ({
    startCentralGoogleLogin: vi.fn(),
}));

describe('LoginClient heading hierarchy', () => {
    beforeEach(() => {
        window.history.replaceState({}, '', '/login');
        vi.stubGlobal(
            'ResizeObserver',
            class ResizeObserver {
                observe() {}
                unobserve() {}
                disconnect() {}
            },
        );
    });

    it('uses the workspace discovery title as the only H1 on apex login', () => {
        render(<LoginClient subdomain={null} isAdminSubdomain={false} />);

        const primaryHeadings = screen.getAllByRole('heading', { level: 1 });
        expect(primaryHeadings).toHaveLength(1);
        expect(primaryHeadings[0].textContent).toMatch(/masuk ke workspace/i);
        expect(
            screen.getByRole('heading', {
                level: 2,
                name: /selamat datang di polyflow/i,
            }),
        ).toBeTruthy();
    });

    it('shows Google login only when tenant SSO is enabled', () => {
        const { rerender } = render(
            <LoginClient
                subdomain="acme"
                isAdminSubdomain={false}
                centralSsoEnabled
            />,
        );
        expect(
            screen.getByRole('button', { name: 'Masuk dengan Google' }),
        ).toBeTruthy();

        rerender(
            <LoginClient
                subdomain="acme"
                isAdminSubdomain={false}
                centralSsoEnabled={false}
            />,
        );
        expect(
            screen.queryByRole('button', { name: 'Masuk dengan Google' }),
        ).toBeNull();
    });

    it('never shows Google login on the superadmin host', () => {
        render(
            <LoginClient
                subdomain={null}
                isAdminSubdomain
                centralSsoEnabled
            />,
        );
        expect(
            screen.queryByRole('button', { name: 'Masuk dengan Google' }),
        ).toBeNull();
    });

    it('uses the login form title as the only H1 on tenant login', () => {
        render(<LoginClient subdomain="acme" isAdminSubdomain={false} />);

        const primaryHeadings = screen.getAllByRole('heading', { level: 1 });
        expect(primaryHeadings).toHaveLength(1);
        expect(primaryHeadings[0].textContent).toMatch(/^masuk$/i);
        expect(
            screen.getByRole('heading', {
                level: 2,
                name: /selamat datang di acme/i,
            }),
        ).toBeTruthy();
    });
});
