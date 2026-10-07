// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MaintenancePage from '../page';
import { getMaintenanceRequests } from '@/actions/production/maintenance';

vi.mock('@/actions/production/maintenance', () => ({
    getMaintenanceRequests: vi.fn(),
}));
vi.mock('next/link', () => ({
    default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a {...props}>{children}</a>
    ),
}));

const emptyResult = {
    success: true as const,
    data: {
        rows: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 1,
        stats: {
            pending: 2,
            approved: 1,
            inProgress: 3,
            done: 10,
            machineStopped: 1,
        },
    },
};

beforeEach(() => {
    vi.mocked(getMaintenanceRequests).mockReset().mockResolvedValue(emptyResult);
});

describe('maintenance triage dashboard', () => {
    it('loads the active queue by default and renders actionable metrics', async () => {
        render(
            await MaintenancePage({ searchParams: Promise.resolve({}) }),
        );

        expect(getMaintenanceRequests).toHaveBeenCalledWith(
            expect.objectContaining({ queue: 'ACTIVE', page: 1 }),
        );
        expect(screen.getByText('Pusat Maintenance')).toBeTruthy();
        expect(screen.getAllByText('Menunggu persetujuan').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Siap dikerjakan').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Sedang dikerjakan').length).toBeGreaterThan(0);
        expect(screen.getByText('Mesin berhenti')).toBeTruthy();
        expect(
            screen.getByRole('link', { name: /Lapor kerusakan/ }).getAttribute('href'),
        ).toBe('/production/mobile/maintenance/new');
    });

    it('passes search, status, urgency, queue, and pagination to the server query', async () => {
        render(
            await MaintenancePage({
                searchParams: Promise.resolve({
                    queue: 'ALL',
                    status: 'APPROVED',
                    urgency: 'URGENT',
                    q: 'MC-01',
                    page: '3',
                }),
            }),
        );

        expect(getMaintenanceRequests).toHaveBeenCalledWith({
            queue: 'ALL',
            status: 'APPROVED',
            urgency: 'URGENT',
            q: 'MC-01',
            page: 3,
        });
        expect((screen.getByLabelText('Status') as HTMLSelectElement).value).toBe(
            'APPROVED',
        );
        expect((screen.getByLabelText('Urgensi') as HTMLSelectElement).value).toBe(
            'URGENT',
        );
    });
});
