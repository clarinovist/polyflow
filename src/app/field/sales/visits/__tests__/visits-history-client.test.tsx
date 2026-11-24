// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
    getServerVisits: vi.fn(),
    readQueue: vi.fn(),
    push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: m.push, refresh: vi.fn() }),
}));
vi.mock('@/actions/sales/route-plans', () => ({
    getServerVisits: m.getServerVisits,
}));
vi.mock('@/lib/mobile/visit-offline-queue', () => ({
    readVisitQueue: m.readQueue,
    writeVisitQueue: vi.fn(),
}));

import SalesMobileVisitsHistoryClient from '../visits-history-client';

const partition = { tenantId: 'tenant-1', userId: 'user-1' };

function visit(overrides: Record<string, unknown> = {}) {
    return {
        id: 'visit-1',
        customerId: 'cust-1',
        customerName: 'Toko Contoh',
        checkInTime: '2026-11-24T03:00:00.000Z',
        checkOutTime: '2026-11-24T03:20:00.000Z',
        durationSeconds: 1200,
        distance: 15,
        notes: 'Stok aman',
        purpose: 'Cek stok',
        photoUrl: null,
        synced: true,
        isExtraCall: false,
        extraReason: null,
        reviewStatus: null,
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    m.readQueue.mockReturnValue([]);
    m.getServerVisits.mockResolvedValue({ success: true, data: [visit()] });
});
afterEach(cleanup);

describe('SalesMobileVisitsHistoryClient claim entry point', () => {
    it('links a synced visit to the claim page with its server id', async () => {
        render(<SalesMobileVisitsHistoryClient partition={partition} />);

        const link = await screen.findByRole('link', { name: /Klaim nota/ });
        expect(link.getAttribute('href')).toBe(
            '/field/sales/claims?visitId=visit-1',
        );
    });

    it('offers no claim link for a visit that is not synced yet', async () => {
        m.getServerVisits.mockResolvedValue({ success: true, data: [] });
        m.readQueue.mockReturnValue([
            visit({ id: 'local-1', synced: false, customerName: 'Toko Lokal' }),
        ]);

        render(<SalesMobileVisitsHistoryClient partition={partition} />);

        await screen.findByText('Toko Lokal');
        expect(screen.queryByRole('link', { name: /Klaim nota/ })).toBeNull();
    });

    it('shows the empty state when there are no visits', async () => {
        m.getServerVisits.mockResolvedValue({ success: true, data: [] });

        render(<SalesMobileVisitsHistoryClient partition={partition} />);

        await waitFor(() =>
            expect(screen.getByText('Belum ada kunjungan hari ini')).toBeTruthy(),
        );
    });
});
