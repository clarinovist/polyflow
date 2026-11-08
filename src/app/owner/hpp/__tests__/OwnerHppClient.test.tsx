// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chainScenario } from '@/lib/owner-hpp/__tests__/fixtures';
import { OWNER_HPP_WORKSPACE_VERSION } from '@/lib/owner-hpp/workspace-schema';
import { formatRupiah } from '@/lib/utils/utils';

const mocks = vi.hoisted(() => ({
    save: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
}));

vi.mock('@/actions/owner-hpp/owner-hpp', () => ({
    saveOwnerHppWorkspace: mocks.save,
    getOwnerHppErpChain: vi.fn(),
    listOwnerHppVariantOptions: vi.fn(),
}));
vi.mock('sonner', () => ({
    toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

import { OwnerHppClient } from '../OwnerHppClient';

const UPDATED_AT = '2026-01-01T00:00:00.000Z';

function renderClient() {
    const initial = {
        workspace: {
            version: OWNER_HPP_WORKSPACE_VERSION,
            scenarios: [chainScenario()],
        },
        isStored: true,
        updatedAt: UPDATED_AT,
        notice: null,
    };
    return render(<OwnerHppClient initial={initial} />);
}

function openStage(name: string) {
    const strip = screen.getByRole('navigation', { name: 'Tahap produksi' });
    fireEvent.click(within(strip).getByRole('button', { name: new RegExp(name) }));
}

function stageHppText(): string {
    return screen.getByText('HPP tahap ini').parentElement?.textContent ?? '';
}

describe('/owner/hpp simple screen', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.save.mockResolvedValue({
            success: true,
            data: { updatedAt: '2026-01-02T00:00:00.000Z' },
        });
    });
    afterEach(cleanup);

    it('shows the ERP button, Simpan, the stage strip and one conversion field', () => {
        // Arrange + Act
        renderClient();
        openStage('Packing');

        // Assert
        expect(screen.getByRole('heading', { level: 1, name: 'Kalkulator HPP' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Isi dari ERP' })).toBeTruthy();
        expect(screen.getAllByRole('button', { name: /Simpan/ }).length).toBeGreaterThan(0);
        const strip = screen.getByRole('navigation', { name: 'Tahap produksi' });
        expect(within(strip).getAllByRole('button').map((b) => b.textContent)).toEqual(
            expect.arrayContaining([expect.stringContaining('Extrusion'), expect.stringContaining('Potong'), expect.stringContaining('Packing')]),
        );
        expect(screen.getByRole('textbox', { name: 'Biaya konversi per kg' })).toBeTruthy();
        expect(screen.getByText('tenaga kerja, listrik, mesin, overhead jadi satu angka')).toBeTruthy();
        expect(screen.getByText('Packing · per 1 kg keluaran')).toBeTruthy();
    });

    it('renders the selling price input exactly once', () => {
        renderClient();

        expect(screen.getAllByLabelText(/^Harga jual per/)).toHaveLength(1);
    });

    it('moves scenario controls and cost formulas into the Lanjutan details', () => {
        renderClient();

        const details = screen.getByText('Lanjutan').closest('details');

        expect(details).not.toBeNull();
        expect(details?.open).toBe(false);
        const inside = within(details as HTMLElement);
        expect(inside.getByRole('combobox', { name: 'Skenario' })).toBeTruthy();
        expect(inside.getByRole('button', { name: /Ekspor/ })).toBeTruthy();
        expect(inside.getByRole('button', { name: /Impor/ })).toBeTruthy();
        expect(inside.getAllByRole('combobox', { name: 'Rumus biaya' })).toHaveLength(3);
        expect(inside.getByRole('combobox', { name: 'Tambah biaya' })).toBeTruthy();
        expect(inside.getByRole('button', { name: 'Jadikan tahap akhir' })).toBeTruthy();
        expect(inside.getByRole('button', { name: 'Hapus tahap' })).toBeTruthy();
    });

    it('shows a read-only total with a note when a stage has several cost lines', () => {
        renderClient();

        expect(screen.queryByRole('textbox', { name: 'Biaya konversi per kg' })).toBeNull();
        expect(screen.getByText('3 komponen biaya, ubah di Lanjutan')).toBeTruthy();
        expect(screen.getByTestId('conversion-total').textContent).toBe(
            formatRupiah(650 + 420 + (0.92 * 14500 + 0.03 * 38000 + 0.05 * 2400 + 650 + 420) * 0.05),
        );
    });

    it('updates the stage HPP and enables Simpan when the conversion cost is edited', () => {
        renderClient();
        openStage('Packing');
        expect(stageHppText()).toContain(formatRupiah(17696.175 + 216));
        const [dockSave] = screen.getAllByRole('button', { name: /Simpan/ });
        expect((dockSave as HTMLButtonElement).disabled).toBe(true);

        fireEvent.change(screen.getByRole('textbox', { name: 'Biaya konversi per kg' }), {
            target: { value: '300' },
        });

        expect(stageHppText()).toContain(formatRupiah(17696.175 + 300));
        screen.getAllByRole('button', { name: /Simpan/ }).forEach((button) => {
            expect((button as HTMLButtonElement).disabled).toBe(false);
        });
    });

    it('creates the conversion cost on a brand-new empty stage', () => {
        renderClient();
        fireEvent.click(screen.getByRole('button', { name: /Tahap$/ }));

        fireEvent.change(screen.getByRole('textbox', { name: 'Biaya konversi per kg' }), {
            target: { value: '500' },
        });

        expect(stageHppText()).toContain(formatRupiah(500));
    });

    it('adds a cost line from Lanjutan and reflects it in the main card note', () => {
        renderClient();

        fireEvent.change(screen.getByRole('combobox', { name: 'Tambah biaya' }), {
            target: { value: 'fixed-per-output' },
        });

        expect(screen.getByText('4 komponen biaya, ubah di Lanjutan')).toBeTruthy();
    });

    it('saves the workspace and reports the result', async () => {
        renderClient();
        openStage('Packing');
        fireEvent.change(screen.getByRole('textbox', { name: 'Biaya konversi per kg' }), {
            target: { value: '300' },
        });

        fireEvent.click(screen.getAllByRole('button', { name: /Simpan/ })[0]);

        await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('Tersimpan.'));
        expect(mocks.save).toHaveBeenCalledTimes(1);
        expect(mocks.save.mock.calls[0][1]).toBe(UPDATED_AT);
    });
});
