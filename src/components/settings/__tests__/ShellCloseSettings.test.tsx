// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShellCloseSettings } from '../ShellCloseSettings';

const m = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('@/actions/settings/shell-close-settings', () => ({
    getShellCloseSettings: m.get,
    saveShellCloseSettings: m.save,
}));
vi.mock('sonner', () => ({ toast: { success: m.success, error: m.error } }));

describe('ShellCloseSettings', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        m.get.mockResolvedValue({ success: true, data: { atLastOutput: false } });
        m.save.mockImplementation(async (input: { atLastOutput: boolean }) => ({ success: true, data: input }));
    });
    afterEach(cleanup);

    it('shows the stored zero-length default and saves a switch to last-output closing', async () => {
        render(<ShellCloseSettings />);
        const toggle = await screen.findByRole('switch', { name: 'Akhiri di jam hasil terakhir' });
        expect(toggle.getAttribute('aria-checked')).toBe('false');

        fireEvent.click(toggle);
        fireEvent.click(screen.getByRole('button', { name: /Simpan/ }));

        await waitFor(() => expect(m.save).toHaveBeenCalledWith({ atLastOutput: true }));
        await waitFor(() => expect(m.success).toHaveBeenCalled());
    });

    it('reports a refused save instead of claiming success', async () => {
        m.save.mockResolvedValue({ success: false, error: 'Hanya admin yang dapat mengubah aturan penutupan sesi.' });
        render(<ShellCloseSettings />);

        fireEvent.click(await screen.findByRole('button', { name: /Simpan/ }));

        await waitFor(() => expect(m.error).toHaveBeenCalledWith('Hanya admin yang dapat mengubah aturan penutupan sesi.'));
        expect(m.success).not.toHaveBeenCalled();
    });
});
