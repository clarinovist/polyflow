// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { Role } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

const push = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
    usePathname: () => '/dashboard/settings',
    useRouter: () => ({ push }),
    useSearchParams: () => new URLSearchParams('tab=general'),
}));
vi.mock('../GeneralSettings', () => ({
    GeneralSettings: () => <div>General settings content</div>,
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
        expect(push).toHaveBeenCalledWith('/dashboard/settings?tab=system');
    });
});
