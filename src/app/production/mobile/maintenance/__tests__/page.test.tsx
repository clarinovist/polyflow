// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MobileMaintenancePage from '../page';
import { getMaintenanceRequests } from '@/actions/production/maintenance';

vi.mock('@/actions/production/maintenance', () => ({
    getMaintenanceRequests: vi.fn(),
}));
vi.mock('next/link', () => ({
    default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a {...props}>{children}</a>
    ),
}));

beforeEach(() => {
    vi.mocked(getMaintenanceRequests).mockReset().mockResolvedValue({
        success: true,
        data: {
            rows: [
                {
                    id: 'mt-1',
                    orderNumber: 'MT-1',
                    complaint: 'Bearing berbunyi kasar',
                    urgency: 'URGENT',
                    status: 'APPROVED',
                    assigneeName: 'Teknisi Satu',
                    machineStopped: true,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    machine: { code: 'MC-01', name: 'Mesin Satu' },
                    sparePartCount: 1,
                },
            ],
            total: 1,
            page: 1,
            pageSize: 20,
            totalPages: 1,
            stats: {
                pending: 2,
                approved: 1,
                inProgress: 0,
                done: 4,
                machineStopped: 1,
            },
        },
    } as never);
});

describe('mobile maintenance queue', () => {
    it('uses the mobile detail route and presents localized status context', async () => {
        render(
            await MobileMaintenancePage({
                searchParams: Promise.resolve({}),
            }),
        );

        expect(getMaintenanceRequests).toHaveBeenCalledWith({
            queue: 'ACTIVE',
            page: 1,
        });
        expect(screen.getByText('Siap dikerjakan')).toBeTruthy();
        expect(screen.getByText('Mendesak')).toBeTruthy();
        expect(
            screen.getByRole('link', { name: /MC-01/ }).getAttribute('href'),
        ).toBe('/production/mobile/maintenance/mt-1');
    });

    it('loads closed work when the history tab is selected', async () => {
        render(
            await MobileMaintenancePage({
                searchParams: Promise.resolve({ view: 'history' }),
            }),
        );
        expect(getMaintenanceRequests).toHaveBeenCalledWith({
            queue: 'CLOSED',
            page: 1,
        });
        expect(
            screen
                .getByRole('link', { name: /Riwayat/ })
                .getAttribute('aria-current'),
        ).toBe('page');
    });
});
