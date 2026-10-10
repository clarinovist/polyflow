// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
    updateAvatar: vi.fn(),
    removeAvatar: vi.fn(),
    updateSession: vi.fn(),
    refresh: vi.fn(),
}));

vi.mock('@/actions/settings/profile-actions', () => ({
    updateOwnProfile: m.updateProfile,
    changeOwnPassword: m.changePassword,
    updateOwnAvatar: m.updateAvatar,
    removeOwnAvatar: m.removeAvatar,
}));
vi.mock('next-auth/react', () => ({
    useSession: () => ({ update: m.updateSession }),
}));
vi.mock('next/navigation', () => ({
    useRouter: () => ({ refresh: m.refresh }),
}));
vi.mock('sonner', () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}));

import { ProfileSettings } from '../ProfileSettings';

afterEach(cleanup);
beforeEach(() => {
    vi.resetAllMocks();
    m.updateProfile.mockResolvedValue({
        success: true,
        data: {
            id: 'actor-a',
            name: 'Updated User',
            email: 'updated@example.test',
            locale: 'id',
        },
    });
    m.changePassword.mockResolvedValue({
        success: true,
        data: { success: true },
    });
    m.updateSession.mockResolvedValue(undefined);
});

function renderProfile(authMode: 'LOCAL' | 'CENTRAL' = 'LOCAL') {
    return render(
        <ProfileSettings
            userName="Synthetic User"
            userEmail="staff@example.test"
            userLocale="id"
            userAvatarUrl={null}
            authMode={authMode}
        />,
    );
}

describe('ProfileSettings account modes', () => {
    it('keeps LOCAL profile and password controls keyboard accessible', () => {
        renderProfile();
        expect(screen.getByLabelText('Email').hasAttribute('readonly')).toBe(false);
        expect(screen.getByLabelText('Password Saat Ini')).toBeTruthy();
        const reveal = screen.getByRole('button', { name: 'Tampilkan password' });
        expect(reveal.className).toContain('min-h-11');
        fireEvent.click(reveal);
        expect(screen.getByRole('button', { name: 'Sembunyikan password' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Simpan Perubahan' }).className).toContain('min-h-11');
    });

    it('renders CENTRAL email read-only and does not offer a password form', () => {
        renderProfile('CENTRAL');
        expect(screen.getByLabelText('Email').hasAttribute('readonly')).toBe(true);
        expect(screen.getByText(/Email dikelola oleh layanan login pusat/)).toBeTruthy();
        expect(screen.queryByLabelText('Password Saat Ini')).toBeNull();
        expect(screen.getByText(/Kredensial akun pusat dikelola/)).toBeTruthy();
    });

    it('marks edited profile data dirty and clears the marker after save succeeds', async () => {
        const { container } = renderProfile();
        const name = screen.getByLabelText('Nama');
        fireEvent.change(name, { target: { value: 'Updated User' } });
        expect(container.querySelector('form[data-unsaved="true"]')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Simpan Perubahan' }));
        await waitFor(() =>
            expect(m.updateProfile).toHaveBeenCalledWith({
                name: 'Updated User',
                email: 'staff@example.test',
                locale: 'id',
            }),
        );
        await waitFor(() =>
            expect(container.querySelector('form[data-unsaved="true"]')).toBeNull(),
        );
        expect(m.updateSession).toHaveBeenCalledWith({
            name: 'Updated User',
            email: 'updated@example.test',
        });
        expect(m.refresh).toHaveBeenCalledOnce();
    });

    it('marks password edits dirty and clears them after a successful LOCAL change', async () => {
        const { container } = renderProfile();
        fireEvent.change(screen.getByLabelText('Password Saat Ini'), {
            target: { value: 'old-secret' },
        });
        fireEvent.change(screen.getByLabelText('Password Baru'), {
            target: { value: 'new-secret' },
        });
        fireEvent.change(screen.getByLabelText('Konfirmasi Password Baru'), {
            target: { value: 'new-secret' },
        });
        expect(container.querySelectorAll('form[data-unsaved="true"]')).toHaveLength(1);

        fireEvent.click(screen.getByRole('button', { name: 'Ubah Password' }));
        await waitFor(() =>
            expect(m.changePassword).toHaveBeenCalledWith({
                currentPassword: 'old-secret',
                newPassword: 'new-secret',
            }),
        );
        await waitFor(() =>
            expect(container.querySelector('form[data-unsaved="true"]')).toBeNull(),
        );
    });
});
