// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
    getUsers: vi.fn(), invite: vi.fn(), cancel: vi.fn(), copy: vi.fn(),
    error: vi.fn(), success: vi.fn(), update: vi.fn(), roles: vi.fn(),
}));
vi.mock('@/actions/admin/users', () => ({
    getUsers: m.getUsers, inviteUserToCentralLogin: m.invite,
    cancelUserCentralInvitation: m.cancel, updateUser: m.update, setUserRoles: m.roles,
    createUser: vi.fn(), deleteUser: vi.fn(), reactivateUser: vi.fn(), revokeUserCentralMembership: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { error: m.error, success: m.success, warning: vi.fn() } }));
import { UsersTab } from '../UsersTab';

function user(id = 'actor-a', name = 'Test User') {
    return { id, name, email: `${id}@example.test`, role: 'SALES', roles: ['SALES'],
        isActive: true, createdAt: new Date(), authMode: 'LOCAL', centralAccountId: null,
        centralMembershipStatus: null, centralInvitationStatus: null as string | null,
        centralInvitationId: null as string | null };
}
let users: ReturnType<typeof user>[];
const link = (id: string) => `https://tenant.example.test/login#invite=synthetic-invitation-${id}-long-enough`;
function invitation(id: string) {
    const target = users.find(u => u.id === id)!;
    return { invitationId: `invite-${id}`, invitationUrl: link(id),
        expiresAt: new Date(Date.now() + 3600_000),
        recipient: { id, name: target.name, email: target.email },
        tenant: { name: 'Test Company', origin: 'https://tenant.example.test' } };
}
const create = async (name = 'Test User') => {
    fireEvent.click(await screen.findByRole('button', { name: `Buat undangan login Google untuk ${name}` }));
    return screen.findByRole('dialog');
};
const pending = () => { users[0].centralInvitationStatus = 'PENDING'; users[0].centralInvitationId = 'previous-invite'; };
const openReplacement = async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Tautan undangan Google untuk Test User' }));
    return screen.findByRole('alertdialog');
};
const confirmReplacement = async () => fireEvent.click(within(await openReplacement()).getByRole('button', { name: 'Batalkan tautan lama & buat baru' }));

beforeEach(() => {
    vi.clearAllMocks();
    users = [user()];
    m.getUsers.mockImplementation(async () => ({ success: true, data: users.map(u => ({ ...u })) }));
    m.invite.mockImplementation(async (id: string) => {
        const data = invitation(id);
        users = users.map(u => u.id === id ? { ...u, centralInvitationStatus: 'PENDING', centralInvitationId: data.invitationId } : u);
        return { success: true, data };
    });
    m.cancel.mockImplementation(async (id: string) => {
        users = users.map(u => u.id === id ? { ...u, centralInvitationStatus: null, centralInvitationId: null } : u);
        return { success: true, data: { revoked: true, invitationId: 'previous-invite' } };
    });
    m.copy.mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: m.copy } });
    m.update.mockResolvedValue({ success: true }); m.roles.mockResolvedValue({ success: true });
});
afterEach(() => vi.restoreAllMocks());

describe('native user invitation handoff', () => {
    it('opens the recipient/tenant popup, copies explicitly and reopens without issuing another token', async () => {
        const storage = vi.spyOn(Storage.prototype, 'setItem');
        render(<UsersTab centralSsoEnabled />);
        const dialog = await create();
        expect(within(dialog).getByText('Test Company')).toBeTruthy();
        expect(within(dialog).getByText('actor-a@example.test')).toBeTruthy();
        expect(within(dialog).getByText(/WIB$/)).toBeTruthy();
        expect((within(dialog).getByLabelText('Tautan undangan') as HTMLTextAreaElement).value).toBe(link('actor-a'));
        expect(m.copy).not.toHaveBeenCalled();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Salin tautan' }));
        await waitFor(() => expect(m.copy).toHaveBeenCalledWith(link('actor-a')));
        expect(await within(dialog).findByText(/Tautan tersalin/)).toBeTruthy();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Tutup' }));
        const reopen = await screen.findByRole('button', { name: 'Tautan undangan Google untuk Test User' });
        await waitFor(() => expect(document.activeElement).toBe(reopen));
        fireEvent.click(reopen);
        expect(await screen.findByRole('dialog')).toBeTruthy();
        expect(m.invite).toHaveBeenCalledTimes(1);
        expect(m.cancel).not.toHaveBeenCalled();
        expect(storage).not.toHaveBeenCalled();
    });

    it('retains the selectable URL if clipboard permission fails', async () => {
        m.copy.mockRejectedValue(new Error('clipboard blocked'));
        render(<UsersTab centralSsoEnabled />); const dialog = await create();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Salin tautan' }));
        expect(await within(dialog).findByText(/salin secara manual/)).toBeTruthy();
        const field = within(dialog).getByLabelText('Tautan undangan') as HTMLTextAreaElement;
        fireEvent.click(field);
        expect(field.readOnly).toBe(true);expect(field.selectionEnd).toBe(field.value.length);
        expect(m.invite).toHaveBeenCalledTimes(1);
    });

    it('keeps links scoped to the correct recipient when multiple invitations are created', async () => {
        users.push(user('actor-b', 'Second User'));
        render(<UsersTab centralSsoEnabled />);
        fireEvent.click(within(await create()).getByRole('button', { name: 'Tutup' }));
        const second = await create('Second User');
        expect((within(second).getByLabelText('Tautan undangan') as HTMLTextAreaElement).value).toBe(link('actor-b'));
        fireEvent.click(within(second).getByRole('button', { name: 'Tutup' }));
        fireEvent.click(screen.getByRole('button', { name: 'Tautan undangan Google untuk Test User' }));
        expect((within(await screen.findByRole('dialog')).getByLabelText('Tautan undangan') as HTMLTextAreaElement).value).toBe(link('actor-a'));
    });

    it('requires explicit confirmation after remount; does not pretend to retrieve a lost token', async () => {
        const view = render(<UsersTab centralSsoEnabled />);await create();view.unmount();
        render(<UsersTab centralSsoEnabled />);
        const confirmation = await openReplacement();
        expect(within(confirmation).getByText(/membatalkan tautan lama/)).toBeTruthy();
        expect(m.cancel).not.toHaveBeenCalled();
        fireEvent.click(within(confirmation).getByRole('button', { name: 'Kembali' }));
        expect(m.invite).toHaveBeenCalledTimes(1);
        await confirmReplacement();
        expect(await screen.findByRole('dialog')).toBeTruthy();
        expect(m.cancel).toHaveBeenCalledWith('actor-a');expect(m.invite).toHaveBeenCalledTimes(2);
    });

    it.each(['failure', 'race'])('does not issue a new invitation if cancellation returns %s', async (kind) => {
        pending();m.cancel.mockResolvedValue(kind === 'failure' ? { success: false, error: 'Denied' } : { success: true, data: { revoked: false } });
        render(<UsersTab centralSsoEnabled />);await confirmReplacement();
        await waitFor(() => expect(m.error).toHaveBeenCalled());
        expect(m.invite).not.toHaveBeenCalled();
    });

    it('explains partial failure when old token is cancelled but replacement fails', async () => {
        pending();m.invite.mockResolvedValue({ success: false, error: 'Failed' });
        render(<UsersTab centralSsoEnabled />);await confirmReplacement();
        await waitFor(() => expect(m.error).toHaveBeenCalledWith(expect.stringContaining('Undangan lama sudah dibatalkan')));
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(await screen.findByRole('button', { name: 'Buat undangan login Google untuk Test User' })).toBeTruthy();
    });

    it('handles thrown requests, unlocks controls, and does not claim creation succeeded', async () => {
        m.invite.mockRejectedValue(new Error('network'));
        render(<UsersTab centralSsoEnabled />);
        const button = await screen.findByRole('button', { name: 'Buat undangan login Google untuk Test User' });fireEvent.click(button);
        await waitFor(() => expect(m.error).toHaveBeenCalledWith(expect.stringContaining('belum terkonfirmasi')));
        await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('keeps the only new URL available when list refresh fails', async () => {
        m.getUsers.mockResolvedValueOnce({ success: true, data: [user()] })
            .mockRejectedValue(new Error('refresh unavailable'));
        render(<UsersTab centralSsoEnabled />);
        const dialog = await create();
        await waitFor(() => expect(m.error).toHaveBeenCalledWith('Gagal memperbarui daftar pengguna.'));
        expect((within(dialog).getByLabelText('Tautan undangan') as HTMLTextAreaElement).value).toBe(link('actor-a'));
        fireEvent.click(within(dialog).getByRole('button', { name: 'Tutup' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Tautan undangan Google untuk Test User' }));
        expect(await screen.findByRole('dialog')).toBeTruthy();
        expect(m.invite).toHaveBeenCalledTimes(1);
    });

    it('discards the popup if the fresh list already reports another invitation', async () => {
        m.getUsers.mockResolvedValueOnce({ success: true, data: [user()] })
            .mockResolvedValue({ success: true, data: [{ ...user(), centralInvitationStatus: 'PENDING', centralInvitationId: 'other-invite' }] });
        render(<UsersTab centralSsoEnabled />);
        fireEvent.click(await screen.findByRole('button', { name: 'Buat undangan login Google untuk Test User' }));
        await waitFor(() => expect(m.getUsers).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        fireEvent.click(screen.getByRole('button', { name: 'Tautan undangan Google untuk Test User' }));
        expect(await screen.findByRole('alertdialog')).toBeTruthy();
    });

    it('explains thrown replacement errors after cancellation without showing the old link', async () => {
        pending();m.invite.mockRejectedValue(new Error('network'));
        render(<UsersTab centralSsoEnabled />);await confirmReplacement();
        await waitFor(() => expect(m.error).toHaveBeenCalledWith(expect.stringContaining('Undangan lama sudah dibatalkan')));
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('blocks duplicate submission while the request is pending', async () => {
        let resolve!: (value: unknown) => void;
        m.invite.mockImplementation(() => new Promise(r => { resolve = r; }));
        render(<UsersTab centralSsoEnabled />);
        const button = await screen.findByRole('button', { name: 'Buat undangan login Google untuk Test User' });
        fireEvent.click(button);fireEvent.click(button);expect(m.invite).toHaveBeenCalledTimes(1);
        await act(async () => resolve({ success: false, error: 'Test failure' }));
    });

    it('cancellation clears the cached URL', async () => {
        render(<UsersTab centralSsoEnabled />);
        fireEvent.click(within(await create()).getByRole('button', { name: 'Tutup' }));
        fireEvent.click(screen.getByRole('button', { name: 'Batalkan undangan Google untuk Test User' }));
        await waitFor(() => expect(m.success).toHaveBeenCalledWith('Undangan Google dibatalkan.'));
        expect(screen.queryByRole('button', { name: 'Tautan undangan Google untuk Test User' })).toBeNull();
    });

    it.each(['id', 'email', 'expiry', 'inactive'])('does not reopen a cached URL after %s invalidation', async (change) => {
        render(<UsersTab centralSsoEnabled />);
        fireEvent.click(within(await create()).getByRole('button', { name: 'Tutup' }));
        if (change === 'expiry') vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 7200_000);
        else if (change === 'id') users[0].centralInvitationId = 'replaced-elsewhere';
        else if (change === 'email') users[0].email = 'updated@example.test';
        else users[0].isActive = false;
        // Existing edit flow refreshes the authoritative list.
        fireEvent.click(screen.getByTitle('Ubah pengguna'));
        fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Simpan Perubahan' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        const reopen = await screen.findByRole('button', { name: 'Tautan undangan Google untuk Test User' });
        if (change === 'inactive') expect((reopen as HTMLButtonElement).disabled).toBe(true);
        else { fireEvent.click(reopen);expect(await screen.findByRole('alertdialog')).toBeTruthy(); }
    });
});
