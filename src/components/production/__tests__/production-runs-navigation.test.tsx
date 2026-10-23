// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RunsListClient } from '../runs/RunsListClient';
const mocks = vi.hoisted(() => ({ create: vi.fn(), preview: vi.fn(), push: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('@/actions/production/production-runs', () => ({ createProductionRun: mocks.create, previewProductionRun: mocks.preview }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));
beforeEach(() => {
    vi.resetAllMocks();
    mocks.preview.mockResolvedValue({ success: true, data: [] });
    mocks.create.mockResolvedValue({ success: true, data: { id: 'run-test' } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [{ id: 'route-test', name: 'Test route', code: 'TEST', version: 1, isDefault: true, _count: { steps: 3 } }] }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('rangkaian production entry', () => {
    it('shows route fetch failures with retry instead of an empty routing list', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response);
        render(<RunsListClient initialRuns={[]} />);
        fireEvent.click(screen.getAllByRole('button', { name: 'Buat Rangkaian Produksi' })[0]);
        expect(await screen.findByRole('alert')).toBeTruthy();
        expect(screen.queryByText(/Tidak ada routing yang sudah diterbitkan/)).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
        expect(await screen.findByRole('button', { name: /Test route/ })).toBeTruthy();
        expect(screen.queryByRole('alert')).toBeNull();
    });
    it('distinguishes no matching results from an empty directory and can clear filters', () => {
        render(<RunsListClient initialRuns={[{ id: 'run', runNumber: 'RUN-01', status: 'DRAFT', plannedQuantity: 10 }]} />);
        fireEvent.change(screen.getByPlaceholderText('Cari rangkaian / routing / SKU / produk'), { target: { value: 'not-found' } });
        expect(screen.getByText('Tidak ada rangkaian sesuai filter')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Hapus filter' }));
        expect(screen.getByRole('link', { name: 'RUN-01' })).toBeTruthy();
    });
    it('fixes the request link, explains object relationships and navigates to the created run', async () => {
        render(<RunsListClient initialRuns={[]} />);
        expect(screen.getByRole('link', { name: 'Papan Permintaan' }).getAttribute('href')).toBe('/production/requests');
        expect(screen.getByRole('link', { name: 'Buat SPK satu tahap tanpa routing →' }).getAttribute('href')).toBe('/production/orders/create');
        fireEvent.click(screen.getAllByRole('button', { name: 'Buat Rangkaian Produksi' })[0]);
        fireEvent.click(await screen.findByRole('button', { name: /Test route/ }));
        fireEvent.change(screen.getByPlaceholderText('Contoh: 1000'), { target: { value: '100' } });
        expect(screen.getByText('Akan membuat rangkaian dengan 3 SPK, satu per tahap routing.')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Buat Rangkaian Produksi' }));
        await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/production/runs/run-test'));
        expect(mocks.success).toHaveBeenCalledWith(expect.stringContaining('Rangkaian Produksi berhasil dibuat'));
    });
    it('shows creation failure instead of navigating', async () => {
        mocks.create.mockRejectedValue(new Error('Network'));
        render(<RunsListClient initialRuns={[]} />);
        fireEvent.click(screen.getAllByRole('button', { name: 'Buat Rangkaian Produksi' })[0]);
        fireEvent.click(await screen.findByRole('button', { name: /Test route/ }));
        fireEvent.change(screen.getByPlaceholderText('Contoh: 1000'), { target: { value: '100' } });
        fireEvent.click(screen.getByRole('button', { name: 'Buat Rangkaian Produksi' }));
        await waitFor(() => expect(mocks.error).toHaveBeenCalled());
        expect(mocks.push).not.toHaveBeenCalled();
    });
});
