// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminHome from '../page';
import AdminAttention from '../attention/page';
import AdminInsights from '../insights/page';
import AdminLayout from '../layout';
import AdminLoading from '../loading';
import AdminError from '../error';

const m = vi.hoisted(() => ({
    overview: vi.fn(),
    guard: vi.fn(),
    retry: vi.fn(),
    taskStarted: vi.fn(),
}));
let pathname = '/mobile/admin';
vi.mock('@/actions/dashboard/mobile-admin', () => ({
    getAdminMobileOverview: m.overview,
    getAdminMobileSection: async () => {
        const response = await m.overview();
        if (!response.success) return response;
        return {
            success: true,
            data: {
                generatedAt: response.data.generatedAt,
                tasks: response.data.tasks,
                counts: response.data.counts,
                modules: response.data.modules,
                unavailableModules: response.data.unavailableModules,
            },
        };
    },
}));
vi.mock('@/lib/mobile/mobile-portal-page-access', () => ({ requireMobilePortalPageAccess: m.guard }));
vi.mock('@/lib/analytics/mobile-task-events', () => ({
    trackTaskStarted: m.taskStarted,
}));
vi.mock('next/navigation', () => ({ usePathname: () => pathname, useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('next/link', () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));
vi.mock('@/components/mobile/LiveMobileConnectivity', () => ({ LiveMobileConnectivity: () => null }));

const data = {
    generatedAt: '2026-10-07T00:00:00.000Z',
    highlights: [
        { key: 'a', label: 'A', value: 1, severity: 'WARNING' },
        { key: 'b', label: 'B', value: 2, severity: 'INFO' },
        { key: 'c', label: 'C', value: 3, severity: 'INFO' },
        { key: 'd', label: 'D', value: 4, severity: 'INFO' },
    ],
    tasks: [{ id: 'FINANCE:overdue-ar', module: 'FINANCE', type: 'overdue-ar', title: 'Tugas baca', count: 5, priority: 'HIGH', href: '/finance/mobile' }],
    counts: { total: 4, returned: 1 },
    modules: [{ key: 'FINANCE', label: 'Finance', state: 'AVAILABLE', exceptionCount: 5, approvalCount: 1 }],
    shortcuts: [{ id: 'finance', label: 'Finance Mobile', href: '/finance/mobile' }],
    unavailableModules: [],
};

beforeEach(() => {
    vi.resetAllMocks();
    pathname = '/mobile/admin';
    m.guard.mockResolvedValue({});
    m.overview.mockResolvedValue({ success: true, data });
});
afterEach(cleanup);

describe('Admin Mobile pages', () => {
    it.each([AdminHome, AdminAttention, AdminInsights])('%s renders exactly one H1', async (Page) => {
        render(await Page());
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    });

    it('renders at most four highlights, total/sample copy, resolver shortcuts, and explicit desktop cards', async () => {
        render(await AdminHome());
        expect(screen.getAllByText(/^[ABCD]$/)).toHaveLength(4);
        expect(screen.getByText('Menampilkan 1 dari 4 kelompok tugas.')).toBeTruthy();
        expect(screen.getByRole('link', { name: /Finance Mobile/ }).getAttribute('href')).toBe('/finance/mobile');
        const taskLink = screen
            .getAllByRole('link')
            .find((link) => link.getAttribute('href') === '/finance/mobile');
        expect(taskLink).toBeTruthy();
        fireEvent.click(taskLink!);
        expect(m.taskStarted).toHaveBeenCalledWith(
            '/mobile/admin/attention',
            'admin',
            'overdue-ar',
        );
        for (const label of ['Settings', 'User & permission', 'Master data', 'Proses bulk']) {
            const link = screen.getByRole('link', { name: new RegExp(label) });
            expect(link.getAttribute('href')).toContain('/device/desktop-required?from=');
        }
        expect(screen.queryByRole('button', { name: /setuju|approve/i })).toBeNull();
    });

    it('keeps truthful partial wording and removes synthetic health claims', async () => {
        m.overview.mockResolvedValue({
            success: true,
            data: {
                ...data,
                unavailableModules: ['FINANCE'],
            },
        });
        render(await AdminHome());
        expect(screen.getByRole('alert').textContent).toContain(
            'tidak dianggap nol',
        );
        expect(
            screen.queryByText(/Kesehatan aplikasi|Aplikasi dapat membaca/i),
        ).toBeNull();
    });

    it('shows expected read failure instead of an empty zero dashboard', async () => {
        m.overview.mockResolvedValue({ success: false });
        render(await AdminHome());
        expect(screen.getByRole('alert')).toBeTruthy();
    });

    it('does not render a direct URL when the layout guard denies access', async () => {
        m.guard.mockRejectedValueOnce(new Error('redirect:/mobile?reason=role'));
        await expect(
            AdminLayout({ children: <h1>Tidak boleh tampil</h1> }),
        ).rejects.toThrow('redirect:/mobile?reason=role');
    });

    it.each([
        ['/mobile/admin', '/mobile/admin'],
        ['/mobile/admin/attention', '/mobile/admin/attention'],
        ['/mobile/admin/insights', '/mobile/admin/insights'],
        ['/mobile', '/mobile'],
    ])('marks exactly one current nav item at %s', async (currentPath, expectedHref) => {
        pathname = currentPath;
        render(await AdminLayout({ children: <h1>Halaman Admin</h1> }));
        const nav = screen.getByRole('navigation', { name: 'Navigasi Admin Mobile' });
        const current = screen.getAllByRole('link').filter((link) =>
            link.closest('nav') === nav && link.getAttribute('aria-current') === 'page',
        );
        expect(current).toHaveLength(1);
        expect(current[0].getAttribute('href')).toBe(expectedHref);
        if (currentPath.startsWith('/mobile/admin')) {
            expect(screen.getByRole('link', { name: 'Portal' }).getAttribute('aria-current')).toBeNull();
        }
    });

    it('layout guards directly and preserves safe-area shell semantics', async () => {
        pathname = '/mobile/admin/attention';
        render(await AdminLayout({ children: <h1>Perhatian</h1> }));
        expect(m.guard).toHaveBeenCalledWith('admin');
        const nav = screen.getByRole('navigation', { name: 'Navigasi Admin Mobile' });
        expect(nav.className).toContain('safe-area-inset-bottom');
        const current = screen.getAllByRole('link').filter((link) => link.closest('nav') === nav && link.getAttribute('aria-current') === 'page');
        expect(current).toHaveLength(1);
        expect(current[0].getAttribute('href')).toBe('/mobile/admin/attention');
        expect(screen.getByRole('link', { name: 'Portal' }).getAttribute('href')).toBe('/mobile');
        expect(screen.getByRole('main').className).toContain('min-w-0');
    });

    it('does not emit task-open telemetry for a non-link task', async () => {
        m.overview.mockResolvedValue({
            success: true,
            data: {
                ...data,
                tasks: [{ ...data.tasks[0], href: null }],
            },
        });
        render(await AdminHome());
        expect(screen.queryByRole('link', { name: /Tugas baca/ })).toBeNull();
        expect(m.taskStarted).not.toHaveBeenCalled();
    });

    it('uses safe loading and error semantics without leaking raw error messages', () => {
        render(<AdminLoading />);
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
        expect(screen.getByRole('status')).toBeTruthy();
        cleanup();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        render(<AdminError error={new Error('synthetic-sensitive-detail')} retry={m.retry} />);
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
        expect(screen.queryByText(/synthetic-sensitive-detail/)).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
        expect(m.retry).toHaveBeenCalledOnce();
    });
});
