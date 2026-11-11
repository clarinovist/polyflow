// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    hasAnyRole: vi.fn(),
}));

vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        notification: { findMany: mocks.findMany, count: mocks.count },
    },
}));
vi.mock('@/lib/core/tenant', () => ({ withTenantPage: (fn: unknown) => fn }));
vi.mock('@/lib/auth/roles', () => ({ hasAnyRole: mocks.hasAnyRole }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/components/hrd/ScanRemindersButton', () => ({
    ScanRemindersButton: () => <button>Jalankan scan</button>,
}));
vi.mock('@/components/hrd/HrAlertActions', () => ({
    MarkAlertReadButton: ({ id }: { id: string }) => (
        <button data-testid={`read-${id}`}>Tandai dibaca</button>
    ),
    MarkAllAlertsReadButton: () => <button>Tandai semua dibaca</button>,
}));

import AlertsPage from '../page';

const baseItem = {
    id: 'alert-1',
    title: 'Kontrak Ani',
    message: 'Segera berakhir',
    isRead: false,
    createdAt: new Date('2026-09-13T00:00:00Z'),
    link: null,
};

function params(value: { unread?: string; page?: string } = {}) {
    return { searchParams: Promise.resolve(value) };
}

describe('AlertsPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.auth.mockResolvedValue({ user: { id: 'user-1' } });
        mocks.hasAnyRole.mockReturnValue(true);
        mocks.findMany.mockResolvedValue([baseItem]);
        mocks.count.mockResolvedValue(1);
    });

    it('applies the unread filter and exposes a stable alert anchor', async () => {
        render(await AlertsPage(params({ unread: 'true' })));

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
        await AlertsPage(params({ unread: 'yes' }));

        const query = mocks.findMany.mock.calls.at(-1)?.[0];
        expect(query.where).not.toHaveProperty('isRead');
    });

    it('renders filter controls that link to the unread view', async () => {
        render(await AlertsPage(params()));

        const unread = screen.getByRole('link', { name: 'Belum dibaca' });
        expect(unread.getAttribute('href')).toBe('/hrd/alerts?unread=true');
        const all = screen.getByRole('link', { name: 'Semua' });
        expect(all.getAttribute('href')).toBe('/hrd/alerts');
    });

    it('shows per-row and bulk mark-read controls only for unread alerts', async () => {
        mocks.findMany.mockResolvedValue([
            baseItem,
            { ...baseItem, id: 'alert-2', title: 'Sudah dibaca', isRead: true },
        ]);
        mocks.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
        render(await AlertsPage(params()));

        expect(screen.getByTestId('read-alert-1')).toBeTruthy();
        expect(screen.queryByTestId('read-alert-2')).toBeNull();
        expect(screen.getByText('Tandai semua dibaca')).toBeTruthy();
    });

    it('hides the bulk mark-read button when nothing is unread', async () => {
        mocks.findMany.mockResolvedValue([{ ...baseItem, isRead: true }]);
        mocks.count.mockResolvedValue(0);
        render(await AlertsPage(params()));

        expect(screen.queryByText('Tandai semua dibaca')).toBeNull();
    });

    it('shows total and pages the query', async () => {
        mocks.count.mockResolvedValue(45);
        render(await AlertsPage(params({ page: '2' })));

        const query = mocks.findMany.mock.calls.at(-1)?.[0];
        expect(query.skip).toBe(20);
        expect(query.take).toBe(20);
        expect(screen.getByText(/21–21 dari 45/)).toBeTruthy();
        expect(
            screen
                .getByRole('link', { name: 'Berikutnya' })
                .getAttribute('href'),
        ).toBe('/hrd/alerts?page=3');
        expect(
            screen
                .getByRole('link', { name: 'Sebelumnya' })
                .getAttribute('href'),
        ).toBe('/hrd/alerts');
    });

    it('falls back to page 1 for an invalid page value', async () => {
        await AlertsPage(params({ page: '-3' }));
        expect(mocks.findMany.mock.calls.at(-1)?.[0].skip).toBe(0);
    });

    it('shows the scan button for HRD/ADMIN but hides it for others', async () => {
        mocks.hasAnyRole.mockImplementation(
            (_user: unknown, roles: string[]) => roles.includes('HRD'),
        );
        const { unmount } = render(await AlertsPage(params()));
        expect(screen.getByText('Jalankan scan')).toBeTruthy();
        unmount();

        mocks.hasAnyRole.mockImplementation(
            (_user: unknown, roles: string[]) => roles.includes('FINANCE'),
        );
        render(await AlertsPage(params()));
        expect(screen.queryByText('Jalankan scan')).toBeNull();
    });
});
