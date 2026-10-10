// @vitest-environment jsdom
import type { AnchorHTMLAttributes } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { signOut } from 'next-auth/react';
import { MobileAccountMenu } from '../mobile-account-menu';

vi.mock('next/link', () => ({
    default: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock('next-auth/react', () => ({ signOut: vi.fn() }));
const user = { name: 'Synthetic User', role: 'SALES' };
const workspaces = [
    { tenantId: 'tenant-a', name: 'Synthetic A', subdomain: 'tenant-a', href: 'https://tenant-a.example.test/login' },
    { tenantId: 'tenant-b', name: 'Synthetic B', subdomain: 'tenant-b', href: 'https://tenant-b.example.test/login' },
];

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });

function openAccount() {
    const trigger = screen.getByRole('button', { name: 'Menu akun Synthetic User' });
    expect(trigger.className).toContain('min-h-11');
    fireEvent.click(trigger);
}

async function openCompanies() {
    render(<MobileAccountMenu user={user} currentTenantId="tenant-a" currentTenantName="Synthetic A" workspaces={workspaces} />);
    openAccount();
    fireEvent.keyDown(screen.getByRole('button', { name: /Ganti perusahaan. Perusahaan aktif: Synthetic A/ }), { key: 'Enter' });
    return screen.findByRole('menuitem', { name: 'Synthetic B' });
}

describe('mobile company navigation', () => {
    it('opens real popover/dropdown controls and identifies the active company', async () => {
        const destination = await openCompanies();
        expect(destination.getAttribute('href')).toBe(workspaces[1].href);
        expect(destination.className).toContain('min-h-11');
        expect(destination.getAttribute('aria-current')).toBeNull();
        expect(screen.getByRole('menuitem', { name: /Synthetic A/ }).getAttribute('aria-current')).toBe('true');
        expect(screen.getAllByRole('menuitem')).toHaveLength(2);
        fireEvent.keyDown(destination, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    });

    it.each([{ choices: [] }, { choices: workspaces.slice(0, 1) }])('shows the company without a switch button for zero/one choices', ({ choices }) => {
        render(<MobileAccountMenu user={user} currentTenantName="Synthetic A" workspaces={choices} />);
        openAccount();
        expect(screen.getByLabelText('Perusahaan aktif: Synthetic A')).toBeTruthy();
        expect(screen.queryByRole('button', { name: /Ganti perusahaan/ })).toBeNull();
        expect(screen.getByRole('button', { name: 'Keluar' })).toBeTruthy();
    });

    it('keeps logout available when workspace listing fails and shows a generic retry hint', () => {
        render(<MobileAccountMenu user={user} workspacesUnavailable />);
        openAccount();
        expect(screen.getByRole('status').textContent).toContain('Muat ulang halaman');
        expect(screen.queryByRole('button', { name: /Ganti perusahaan/ })).toBeNull();
        expect(screen.getByRole('button', { name: 'Keluar' })).toBeTruthy();
    });

    it('cancels cross-company navigation when the marked dirty form is not confirmed', async () => {
        const form = document.createElement('form');
        form.dataset.unsaved = 'true';
        document.body.appendChild(form);
        try {
            const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
            const destination = await openCompanies();
            expect(fireEvent.click(destination)).toBe(false);
            expect(confirm).toHaveBeenCalledWith('Ada perubahan yang belum disimpan. Tetap ganti perusahaan?');
            expect(signOut).not.toHaveBeenCalled();
        } finally { form.remove(); }
    });

    it('shows account and portal navigation with compact accessible trigger', () => {
        render(<MobileAccountMenu user={user} />);
        const trigger = screen.getByRole('button', { name: 'Menu akun Synthetic User' });
        expect(trigger.className).toContain('min-w-11');
        expect(trigger.textContent).toContain('Synthetic User');
        openAccount();
        expect(screen.getByRole('link', { name: 'Akun Saya' }).getAttribute('href')).toBe('/mobile/account');
        expect(screen.getByRole('link', { name: 'Pilih Portal' }).getAttribute('href')).toBe('/mobile');
    });

    it('suppresses contextual self links without hiding logout', () => {
        render(<MobileAccountMenu user={user} hideAccountLink hidePortalLink />);
        openAccount();
        expect(screen.queryByRole('link', { name: 'Akun Saya' })).toBeNull();
        expect(screen.queryByRole('link', { name: 'Pilih Portal' })).toBeNull();
        expect(screen.getByRole('button', { name: 'Keluar' })).toBeTruthy();
    });

    it('retains normal logout behavior without company data', () => {
        render(<MobileAccountMenu user={user} />);
        openAccount();
        fireEvent.click(screen.getByRole('button', { name: 'Keluar' }));
        expect(signOut).toHaveBeenCalledWith({ callbackUrl: '/login' });
    });

    it('uses a supplied logout handler without signing out twice', () => {
        const onLogout = vi.fn();
        render(<MobileAccountMenu user={user} onLogout={onLogout} />);
        openAccount();
        fireEvent.click(screen.getByRole('button', { name: 'Keluar' }));
        expect(onLogout).toHaveBeenCalledOnce();
        expect(signOut).not.toHaveBeenCalled();
    });
});
