// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    findMany: vi.fn(),
}));

vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/core/prisma', () => ({
    prisma: { notification: { findMany: mocks.findMany } },
}));
vi.mock('@/lib/auth/roles', () => ({ hasAnyRole: () => true }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/components/hrd/ScanRemindersButton', () => ({
    ScanRemindersButton: () => <button>Scan</button>,
}));

import AlertsPage from '../page';

describe('AlertsPage', () => {
    beforeEach(() => {
        mocks.auth.mockResolvedValue({ user: { id: 'user-1' } });
        mocks.findMany.mockResolvedValue([
            {
                id: 'alert-1',
                title: 'Kontrak Ani',
                message: 'Segera berakhir',
                isRead: false,
                createdAt: new Date('2026-09-13T00:00:00Z'),
                link: null,
            },
        ]);
    });

    it('applies the unread filter and exposes a stable alert anchor', async () => {
        render(
            await AlertsPage({
                searchParams: Promise.resolve({ unread: 'true' }),
            }),
        );

        expect(mocks.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ isRead: false }),
            }),
        );
        expect(screen.getByText('Kontrak Ani').closest('[id]')?.id).toBe(
            'alert-alert-1',
        );
    });

    it('does not apply an unread filter for unsupported values', async () => {
        await AlertsPage({
            searchParams: Promise.resolve({ unread: 'yes' }),
        });

        const query = mocks.findMany.mock.calls.at(-1)?.[0];
        expect(query.where).not.toHaveProperty('isRead');
    });
});
