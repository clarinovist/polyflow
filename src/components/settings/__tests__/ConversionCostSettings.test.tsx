// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConversionCostSettings } from '../ConversionCostSettings';

const m = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('@/actions/settings/conversion-cost-settings', () => ({
    getConversionCostSettings: m.get,
    saveConversionCostSettings: m.save,
}));
vi.mock('sonner', () => ({ toast: { success: m.success, error: m.error } }));

const accounts = [
    { id: 'acc-labour', code: '5-012b', name: 'Tenaga kerja langsung', isActive: true },
    { id: 'acc-power', code: '5-031', name: 'Listrik', isActive: true },
    { id: 'acc-old', code: '5-099', name: 'Akun lama', isActive: false },
];
const loaded = (setting: { enabled: boolean; accountIds: string[] }) =>
    m.get.mockResolvedValue({ success: true, data: { setting, accounts } });

describe('ConversionCostSettings', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        loaded({ enabled: false, accountIds: [] });
        m.save.mockImplementation(async (input: unknown) => ({ success: true, data: input }));
    });
    afterEach(cleanup);

    it('keeps the session-based default and hides the account list until switched on', async () => {
        render(<ConversionCostSettings />);
        const toggle = await screen.findByRole('switch', { name: 'Ambil biaya konversi dari jurnal' });

        expect(toggle.getAttribute('aria-checked')).toBe('false');
        expect(screen.queryByRole('checkbox')).toBeNull();
    });

    it('saves the chosen expense accounts once switched on', async () => {
        render(<ConversionCostSettings />);
        fireEvent.click(await screen.findByRole('switch', { name: 'Ambil biaya konversi dari jurnal' }));
        fireEvent.click(screen.getByRole('checkbox', { name: /5-012b Tenaga kerja langsung/ }));
        fireEvent.click(screen.getByRole('checkbox', { name: /5-031 Listrik/ }));
        fireEvent.click(screen.getByRole('button', { name: /Simpan/ }));

        await waitFor(() => expect(m.save).toHaveBeenCalledWith({ enabled: true, accountIds: ['acc-labour', 'acc-power'] }));
        await waitFor(() => expect(m.success).toHaveBeenCalled());
    });

    it('warns that enabling without accounts removes conversion cost, and notes running SPKs get none', async () => {
        loaded({ enabled: true, accountIds: [] });
        render(<ConversionCostSettings />);

        expect(await screen.findByText(/tidak memuat biaya konversi sama sekali/)).toBeTruthy();
        expect(screen.getByText(/SPK yang masih berjalan tidak mendapat alokasi/)).toBeTruthy();
    });

    it('lists a saved inactive account so it can be removed', async () => {
        loaded({ enabled: true, accountIds: ['acc-old'] });
        render(<ConversionCostSettings />);
        const old = await screen.findByRole('checkbox', { name: /5-099 Akun lama \(nonaktif\)/ });

        expect(old.getAttribute('aria-checked')).toBe('true');
        fireEvent.click(old);
        fireEvent.click(screen.getByRole('button', { name: /Simpan/ }));

        await waitFor(() => expect(m.save).toHaveBeenCalledWith({ enabled: true, accountIds: [] }));
    });

    it('reports a refused save instead of claiming success', async () => {
        m.save.mockResolvedValue({ success: false, error: 'Hanya akun beban (EXPENSE) yang dapat dipakai sebagai sumber biaya konversi.' });
        render(<ConversionCostSettings />);

        fireEvent.click(await screen.findByRole('button', { name: /Simpan/ }));

        await waitFor(() => expect(m.error).toHaveBeenCalledWith('Hanya akun beban (EXPENSE) yang dapat dipakai sebagai sumber biaya konversi.'));
        expect(m.success).not.toHaveBeenCalled();
    });

    it('shows why the setting could not be loaded', async () => {
        m.get.mockResolvedValue({ success: false, error: 'Hanya admin yang dapat mengubah sumber biaya konversi.' });
        render(<ConversionCostSettings />);

        expect(await screen.findByText('Hanya admin yang dapat mengubah sumber biaya konversi.')).toBeTruthy();
        expect(screen.queryByRole('button', { name: /Simpan/ })).toBeNull();
    });
});
