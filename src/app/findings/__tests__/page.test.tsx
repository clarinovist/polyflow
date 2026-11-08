// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    list: vi.fn(),
    redirect: vi.fn((to: string) => {
        throw new Error(`NEXT_REDIRECT:${to}`);
    }),
    inbox: vi.fn(),
}));

vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/actions/findings/finding-actions', () => ({
    listMyFindings: mocks.list,
}));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('../FindingsInbox', () => ({
    FindingsInbox: (props: unknown) => {
        mocks.inbox(props);
        return <div data-testid="inbox" />;
    },
}));

import FindingsPage, { dynamic, metadata } from '../page';

const ROW = {
    id: 'f1',
    fingerprint: 'overdue_ar:i1',
    detector: 'overdue_ar',
    severity: 'WARNING',
    status: 'UNCLAIMED',
    headline: 'Invoice INV-1 — Customer A (SO: SO-1)',
    firstSeenAt: '2026-11-01T00:00:00.000Z',
    slaDueAt: null,
};

describe('/findings page', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.auth.mockResolvedValue({ user: { id: 'user-1' } });
        mocks.list.mockResolvedValue({ success: true, data: [ROW] });
    });

    it('redirects visitors without a session to login before reading any data', async () => {
        mocks.auth.mockResolvedValue(null);

        await expect(FindingsPage()).rejects.toThrow('NEXT_REDIRECT:/login');
        expect(mocks.list).not.toHaveBeenCalled();
    });

    it('redirects a session that has no user id', async () => {
        mocks.auth.mockResolvedValue({ user: {} });

        await expect(FindingsPage()).rejects.toThrow('NEXT_REDIRECT:/login');
    });

    it('hands grouped sections and the viewer id to the inbox', async () => {
        render(await FindingsPage());

        expect(screen.getByTestId('inbox')).toBeTruthy();
        const props = mocks.inbox.mock.calls[0][0] as {
            myUserId: string;
            sections: Array<{ key: string; count: number }>;
        };
        expect(props.myUserId).toBe('user-1');
        expect(props.sections.map((s) => [s.key, s.count])).toEqual([
            ['tunggakan', 1],
        ]);
    });

    it('shows an empty state, not an error, when the user sees no findings', async () => {
        mocks.list.mockResolvedValue({ success: true, data: [] });

        render(await FindingsPage());

        expect(screen.getByText('Tidak ada temuan terbuka')).toBeTruthy();
        expect(screen.queryByRole('alert')).toBeNull();
        expect(mocks.inbox).not.toHaveBeenCalled();
    });

    it('shows a readable error when loading fails', async () => {
        mocks.list.mockResolvedValue({
            success: false,
            error: 'Database sibuk',
            code: 'X',
        });

        render(await FindingsPage());

        expect(screen.getByRole('alert').textContent).toContain('Database sibuk');
        expect(mocks.inbox).not.toHaveBeenCalled();
    });

    it('is dynamic and kept out of search engines', () => {
        expect(dynamic).toBe('force-dynamic');
        expect(metadata.robots).toEqual({ index: false, follow: false });
    });
});
