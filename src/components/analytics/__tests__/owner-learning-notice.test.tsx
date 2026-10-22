// @vitest-environment jsdom
/// <reference types="vitest/jsdom" />
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { session, sidebarCollapse } = vi.hoisted(() => ({
    session: vi.fn(),
    sidebarCollapse: vi.fn(() => ({ isCollapsed: false })),
}));
vi.mock('next-auth/react', () => ({ useSession: session }));
vi.mock('@/components/layout/sidebar-collapse-context', () => ({
    useSidebarCollapse: sidebarCollapse,
}));
import { OwnerLearningNotice } from '../owner-learning-notice';
beforeEach(() => {
    sessionStorage.clear();
    // Use jsdom's browser storage, not Node's experimental global storage.
    vi.stubGlobal('localStorage', jsdom.window.localStorage);
    vi.stubGlobal('Storage', jsdom.window.Storage);
    localStorage.clear();
    session.mockReturnValue({
        status: 'authenticated',
        data: { user: { tenantId: 'tenant-a', id: 'u', isSuperAdmin: false } },
    });
    sidebarCollapse.mockReturnValue({ isCollapsed: false });
    vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ active: true, version: 'test-v1' }),
        }),
    );
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});
describe('owner learning transparency', () => {
    it('shows purpose/retention and allows dismiss without treating it as consent', async () => {
        render(<OwnerLearningNotice />);
        await waitFor(() =>
            expect(
                screen.getByLabelText('Informasi analisis penggunaan'),
            ).toBeTruthy(),
        );
        expect(screen.getByText(/Data turunan disimpan 90 hari/)).toBeTruthy();
        expect(
            screen.getByLabelText('Informasi analisis penggunaan').className,
        ).toContain('lg:left-68');
        fireEvent.click(screen.getByText('Tutup informasi'));
        expect(
            screen.queryByLabelText('Informasi analisis penggunaan'),
        ).toBeNull();
    });
    it('keeps dismissal after a tab session ends and the component remounts', async () => {
        const { unmount } = render(<OwnerLearningNotice />);
        fireEvent.click(await screen.findByText('Tutup informasi'));
        expect(
            localStorage.getItem('owner-learning-notice:tenant-a:u:test-v1'),
        ).toBe('seen');
        unmount();
        sessionStorage.clear();

        await act(async () => {
            render(<OwnerLearningNotice />);
        });
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(screen.queryByLabelText('Informasi analisis penggunaan')).toBeNull();
    });

    it('preserves and migrates an existing session dismissal', async () => {
        const key = 'owner-learning-notice:tenant-a:u:test-v1';
        sessionStorage.setItem(key, 'seen');
        await act(async () => {
            render(<OwnerLearningNotice />);
        });
        expect(screen.queryByLabelText('Informasi analisis penggunaan')).toBeNull();
        expect(localStorage.getItem(key)).toBe('seen');
    });

    it.each([
        ['another user', 'tenant-a', 'other-user', 'test-v1'],
        ['another tenant', 'tenant-b', 'u', 'test-v1'],
        ['an updated notice', 'tenant-a', 'u', 'test-v2'],
    ])('still shows the notice for %s', async (_, tenantId, userId, version) => {
        localStorage.setItem('owner-learning-notice:tenant-a:u:test-v1', 'seen');
        session.mockReturnValue({
            status: 'authenticated',
            data: { user: { tenantId, id: userId, isSuperAdmin: false } },
        });
        vi.mocked(fetch).mockResolvedValue({
            ok: true,
            json: async () => ({ active: true, version }),
        } as Response);
        render(<OwnerLearningNotice />);
        expect(await screen.findByLabelText('Informasi analisis penggunaan')).toBeTruthy();
    });

    it('can still be closed when browser storage is unavailable', async () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new DOMException('Storage disabled', 'SecurityError');
        });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new DOMException('Storage disabled', 'SecurityError');
        });
        render(<OwnerLearningNotice />);
        fireEvent.click(await screen.findByText('Tutup informasi'));
        expect(screen.queryByLabelText('Informasi analisis penggunaan')).toBeNull();
    });

    it('falls back to tab storage when persistent storage is blocked', async () => {
        const blocked = () => {
            throw new DOMException('Storage disabled', 'SecurityError');
        };
        vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked });
        const { unmount } = render(<OwnerLearningNotice />);
        fireEvent.click(await screen.findByText('Tutup informasi'));
        expect(sessionStorage.getItem('owner-learning-notice:tenant-a:u:test-v1')).toBe('seen');
        unmount();
        await act(async () => {
            render(<OwnerLearningNotice />);
        });
        expect(screen.queryByLabelText('Informasi analisis penggunaan')).toBeNull();
    });

    it('does not inherit dismissal when switching accounts with storage unavailable', async () => {
        const { rerender } = render(<OwnerLearningNotice />);
        fireEvent.click(await screen.findByText('Tutup informasi'));
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new DOMException('Storage disabled', 'SecurityError');
        });
        session.mockReturnValue({
            status: 'authenticated',
            data: { user: { tenantId: 'tenant-a', id: 'other-user', isSuperAdmin: false } },
        });
        rerender(<OwnerLearningNotice />);
        expect(await screen.findByLabelText('Informasi analisis penggunaan')).toBeTruthy();
    });

    it('moves beside a collapsed desktop sidebar', async () => {
        sidebarCollapse.mockReturnValue({ isCollapsed: true });
        render(<OwnerLearningNotice />);

        await waitFor(() =>
            expect(
                screen.getByLabelText('Informasi analisis penggunaan'),
            ).toBeTruthy(),
        );
        expect(
            screen.getByLabelText('Informasi analisis penggunaan').className,
        ).toContain('lg:left-20');
    });

    it.each([
        { status: 'unauthenticated', data: null },
        { status: 'authenticated', data: { user: { id: 'admin', isSuperAdmin: true } } },
    ])('does not fetch for unauthenticated visitors or superadmins: %j', (value) => {
        session.mockReturnValue(value);
        render(<OwnerLearningNotice />);
        expect(fetch).not.toHaveBeenCalled();
    });
});
