// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MobileMaintenanceDetailPage from '../page';
import { getMaintenanceDetail } from '@/actions/production/maintenance';
import { resolveMobilePortalPageAccess } from '@/lib/mobile/mobile-portal-page-access';

vi.mock('@/actions/production/maintenance', () => ({
    getMaintenanceDetail: vi.fn(),
}));
vi.mock('@/lib/mobile/mobile-portal-page-access', () => ({
    resolveMobilePortalPageAccess: vi.fn(),
}));
vi.mock('../actions', () => ({
    MaintenanceActions: ({
        status,
        viewer,
    }: {
        status: string;
        viewer: { canApprove: boolean; canReject: boolean };
    }) => (
        <div>
            Action panel {status} {viewer.canApprove ? 'approve' : 'read-only'}
        </div>
    ),
}));
vi.mock('next/link', () => ({
    default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a {...props}>{children}</a>
    ),
}));

beforeEach(() => {
    vi.mocked(resolveMobilePortalPageAccess).mockReset().mockResolvedValue({
        allowed: false,
        reason: 'FEATURE',
    });
    vi.mocked(getMaintenanceDetail).mockReset().mockResolvedValue({
        success: true,
        data: {
            id: 'mt-1',
            orderNumber: 'MT-1',
            status: 'APPROVED',
            urgency: 'URGENT',
            complaint: 'Bearing berbunyi kasar.',
            machineStopped: true,
            createdAt: new Date('2026-10-07T00:00:00Z'),
            approvedAt: new Date('2026-10-07T01:00:00Z'),
            completedAt: null,
            rejectionReason: null,
            completionNote: null,
            assigneeName: 'Teknisi Satu',
            assignee: { id: 'tech-1', name: 'Teknisi Satu' },
            createdBy: { id: 'reporter-1', name: 'Pelapor' },
            machine: { id: 'machine-1', code: 'MC-01', name: 'Mesin Satu' },
            spareParts: [],
            viewer: {
                canSubmit: false,
                canApprove: false,
                canReject: false,
                canStart: true,
                canComplete: false,
            },
            technicians: [],
        },
    } as never);
});

describe('mobile maintenance detail route', () => {
    it('renders inside the mobile flow with a valid return destination', async () => {
        render(
            await MobileMaintenanceDetailPage({
                params: Promise.resolve({ id: 'mt-1' }),
            }),
        );

        expect(getMaintenanceDetail).toHaveBeenCalledWith('mt-1');
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
        expect(screen.getByRole('heading', { name: 'MC-01 · Mesin Satu' })).toBeTruthy();
        expect(screen.getByText('Siap dikerjakan')).toBeTruthy();
        expect(screen.getByText('Action panel APPROVED read-only')).toBeTruthy();
        expect(
            screen.getByRole('link', { name: /Antrean maintenance/ }).getAttribute('href'),
        ).toBe('/production/mobile/maintenance');
    });
});
