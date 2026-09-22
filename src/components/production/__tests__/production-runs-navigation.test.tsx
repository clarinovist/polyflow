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
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => [{ id: 'route-test', name: 'Test route', code: 'TEST', version: 1, isDefault: true, _count: { steps: 3 } }] }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('rangkaian production entry', () => {
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
