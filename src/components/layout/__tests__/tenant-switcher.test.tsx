// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TenantSwitcher } from '@/components/layout/tenant-switcher';

vi.mock('@/components/ui/dropdown-menu', () => ({
    DropdownMenu: ({ children }: { children: React.ReactNode }) => children,
    DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) =>
        children,
    DropdownMenuContent: ({ children }: { children: React.ReactNode }) =>
        children,
    DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => (
        <span>{children}</span>
    ),
    DropdownMenuItem: ({ children }: { children: React.ReactNode }) => children,
}));

const workspaces = [
    {
        tenantId: 'tenant-a',
        name: 'Synthetic A',
        subdomain: 'tenant-a',
        href: 'https://tenant-a.example.test/login',
    },
    {
        tenantId: 'tenant-b',
        name: 'Synthetic B',
        subdomain: 'tenant-b',
        href: 'https://tenant-b.example.test/login',
    },
];

describe('TenantSwitcher', () => {
    it('identifies the active company and lists only supplied memberships', () => {
        render(
            <TenantSwitcher
                currentTenantId="tenant-a"
                currentTenantName="Synthetic A"
                workspaces={workspaces}
            />,
        );
        expect(
            screen.getByRole('button', {
                name: /perusahaan aktif: synthetic a/i,
            }),
        ).toBeTruthy();
        expect(
            screen.getByRole('link', { name: /synthetic b/i }).getAttribute(
                'href',
            ),
        ).toBe(workspaces[1].href);
    });

    it('asks before leaving a marked dirty form', () => {
        const form = document.createElement('form');
        form.dataset.unsaved = 'true';
        document.body.appendChild(form);
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
        render(
            <TenantSwitcher
                currentTenantId="tenant-a"
                currentTenantName="Synthetic A"
                workspaces={workspaces}
            />,
        );
        const target = screen.getByRole('link', { name: /synthetic b/i });
        const event = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
        });
        expect(target.dispatchEvent(event)).toBe(false);
        expect(confirm).toHaveBeenCalledOnce();
        fireEvent.click(target);
        form.remove();
        confirm.mockRestore();
    });
});
