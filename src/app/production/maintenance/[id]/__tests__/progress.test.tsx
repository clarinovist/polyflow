// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import Page from '../page';
const mocks = vi.hoisted(() => ({ detail: vi.fn() }));
vi.mock('@/actions/production/maintenance', () => ({ getMaintenanceDetail: mocks.detail }));
vi.mock('@/components/shared/EntityStatusTimeline', () => ({ EntityStatusTimeline: () => null }));
vi.mock('../actions', () => ({ MaintenanceActions: () => null }));
afterEach(cleanup);

describe('maintenance progress', () => {
    it.each(['PENDING', 'APPROVED', 'IN_PROGRESS', 'DONE', 'DRAFT', 'CANCELLED', 'REJECTED'])('distinguishes the active step from completion for %s', async (status) => {
        mocks.detail.mockResolvedValue({ success: true, data: { id: 'm', orderNumber: 'MT-01', status, urgency: 'NORMAL', machine: { code: 'MC-01', name: 'Mesin A' }, createdAt: new Date('2026-10-01T00:00:00Z'), complaint: 'Periksa mesin', spareParts: [], viewer: {}, technicians: [] } });
        const { container } = render(await Page({ params: Promise.resolve({ id: 'm' }) }));
        const active = container.querySelector('[aria-current="step"]');
        const expected = { PENDING: 'Dilaporkan', APPROVED: 'Disetujui', IN_PROGRESS: 'Dikerjakan' }[status];
        if (expected) { expect(active?.textContent).toContain(expected); expect(active?.querySelector('svg')).toBeNull(); }
        else expect(active).toBeNull();
        if (status === 'DONE') expect(container.querySelectorAll('ol li svg')).toHaveLength(4);
        if (['CANCELLED', 'REJECTED'].includes(status)) expect(screen.getByText('Alur dihentikan sebelum pekerjaan selesai.')).toBeTruthy();
    });
});
