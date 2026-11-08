// @vitest-environment jsdom

import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    count: vi.fn(),
    pathname: '/dashboard',
}));

vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname }));
vi.mock('next/link', () => ({
    default: ({
        href,
        children,
        ...props
    }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));
vi.mock('@/actions/findings/finding-count-actions', () => ({
    countMyOpenFindings: mocks.count,
}));

import {
    FINDINGS_CHANGED_EVENT,
    FindingsNavLink,
} from '../findings-nav-link';

describe('FindingsNavLink', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.pathname = '/dashboard';
    });

    it('links to the inbox with the open count', async () => {
        mocks.count.mockResolvedValue(7);

        render(<FindingsNavLink />);

        const link = await screen.findByRole('link', { name: /Temuan/ });
        expect(link.getAttribute('href')).toBe('/findings');
        expect(link.textContent).toContain('7');
    });

    it('renders nothing at zero so users without findings see no clutter', async () => {
        mocks.count.mockResolvedValue(0);

        const { container } = render(<FindingsNavLink />);

        await waitFor(() => expect(mocks.count).toHaveBeenCalled());
        expect(container.querySelector('a')).toBeNull();
    });

    it('renders nothing when the count request fails', async () => {
        mocks.count.mockRejectedValue(new Error('network'));

        const { container } = render(<FindingsNavLink />);

        await waitFor(() => expect(mocks.count).toHaveBeenCalled());
        expect(container.querySelector('a')).toBeNull();
    });

    it('keeps the link on the inbox page even at zero', async () => {
        mocks.pathname = '/findings';
        mocks.count.mockResolvedValue(0);

        render(<FindingsNavLink />);

        const link = await screen.findByRole('link', { name: /Temuan/ });
        expect(link.textContent).not.toMatch(/\d/);
    });

    it('caps large counts', async () => {
        mocks.count.mockResolvedValue(250);

        render(<FindingsNavLink />);

        expect((await screen.findByRole('link')).textContent).toContain('99+');
    });

    it('refreshes after the inbox reports a change', async () => {
        mocks.count.mockResolvedValueOnce(3).mockResolvedValueOnce(1);
        render(<FindingsNavLink />);
        await screen.findByText('3');

        act(() => {
            window.dispatchEvent(new Event(FINDINGS_CHANGED_EVENT));
        });

        await screen.findByText('1');
    });

    it('shows a compact badge when the sidebar is collapsed', async () => {
        mocks.count.mockResolvedValue(4);

        render(<FindingsNavLink collapsed />);

        const link = await screen.findByRole('link', { name: /Temuan/ });
        expect(link.getAttribute('title')).toBe('Temuan');
        expect(link.textContent).toContain('4');
    });
});
