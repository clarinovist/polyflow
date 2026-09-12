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
