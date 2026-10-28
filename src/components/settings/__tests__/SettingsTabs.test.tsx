// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Role } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ push: vi.fn(), general: vi.fn(), search: 'tab=general' }));

vi.mock('next/navigation', () => ({
    usePathname: () => '/dashboard/settings',
    useRouter: () => ({ push: mocks.push }),
    useSearchParams: () => new URLSearchParams(mocks.search),
}));
vi.mock('../GeneralSettings', () => ({
    GeneralSettings: (props: unknown) => {
        mocks.general(props);
        return <div>General settings content</div>;
    },
}));
vi.mock('../UsersTab', () => ({ UsersTab: () => <div>Users content</div> }));
vi.mock('../AccessControlTab', () => ({
    AccessControlTab: () => <div>Access content</div>,
}));
vi.mock('../CompanySettings', () => ({
    CompanySettings: () => <div>Company content</div>,
}));
vi.mock('../KioskFeatureSettings', () => ({
    KioskFeatureSettings: () => <div>Kiosk content</div>,
}));
vi.mock('../ShellCloseSettings', () => ({
    ShellCloseSettings: () => <div>Shell close content</div>,
}));
vi.mock('../ConversionCostSettings', () => ({
    ConversionCostSettings: () => <div>Conversion cost content</div>,
}));
vi.mock('../RoutingFeatureSettings', () => ({
    RoutingFeatureSettings: () => <div>Routing content</div>,
}));
vi.mock('../NotificationSettings', () => ({
    NotificationSettings: () => <div>Notification content</div>,
}));
vi.mock('@/components/hrd/AttendanceSettings', () => ({
    AttendanceSettingsPanel: () => <div>Attendance content</div>,
}));

import { SettingsTabs } from '../SettingsTabs';

describe('SettingsTabs mobile containment', () => {
    it('keeps the authorized tab strip in a labeled keyboard-scrollable region', () => {
        render(
            <SettingsTabs
                currentUserRole={Role.ADMIN}
                currentUserRoles={[Role.ADMIN]}
            />,
        );

        const tabs = screen.getByRole('tablist', {
            name: 'Settings sections',
        });
        expect(tabs.className).toContain('max-w-full');
        expect(tabs.className).toContain('overflow-x-auto');
        expect(tabs.getAttribute('tabindex')).toBe('0');

        const activeTab = screen.getByRole('tab', { name: 'Umum' });
        expect(activeTab.getAttribute('aria-selected')).toBe('true');
        expect(activeTab.getAttribute('aria-current')).toBe('page');
        expect(activeTab.className).toContain('min-h-11');
    });

    it('preserves URL-backed navigation when choosing an authorized tab', () => {
        render(
            <SettingsTabs
                currentUserRole={Role.ADMIN}
                currentUserRoles={[Role.ADMIN]}
            />,
        );

        fireEvent.click(screen.getByRole('tab', { name: 'Sistem' }));
        expect(mocks.push).toHaveBeenCalledWith('/dashboard/settings?tab=system');
    });

    it('passes the account authentication mode to general settings', () => {
        render(
            <SettingsTabs
                currentUserRole={Role.ADMIN}
                currentUserRoles={[Role.ADMIN]}
                currentUserAuthMode="CENTRAL"
            />,
        );
        expect(mocks.general).toHaveBeenCalledWith(
            expect.objectContaining({ authMode: 'CENTRAL' }),
        );
    });
});

describe('SettingsTabs production cost tab', () => {
    afterEach(() => {
        cleanup();
        mocks.search = 'tab=general';
    });

    it('gives admins a Biaya Produksi tab that renders the conversion cost setting', () => {
        mocks.search = 'tab=costing';
        render(<SettingsTabs currentUserRole={Role.ADMIN} currentUserRoles={[Role.ADMIN]} />);

        expect(screen.getByRole('tab', { name: 'Biaya Produksi' }).getAttribute('aria-selected')).toBe('true');
        expect(screen.getByText('Conversion cost content')).toBeTruthy();
    });

    it('hides the tab and its content from non-admins, even via the URL', () => {
        mocks.search = 'tab=costing';
        render(<SettingsTabs currentUserRole={Role.FINANCE} currentUserRoles={[Role.FINANCE]} />);

        expect(screen.queryByRole('tab', { name: 'Biaya Produksi' })).toBeNull();
        expect(screen.queryByText('Conversion cost content')).toBeNull();
    });
});
