// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredOwnerHppWorkspace } from '@/actions/owner-hpp/owner-hpp-query';
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
    const initial: StoredOwnerHppWorkspace = {
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

function overheadInput(): HTMLInputElement {
    return screen.getByRole('textbox', { name: 'Overhead %' }) as HTMLInputElement;
}

const EXTRUSION_PRE_OVERHEAD = 0.92 * 14500 + 0.03 * 38000 + 0.05 * 2400 + 650 + 420;

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
        expect(screen.getByRole('textbox', { name: 'Tenaga / biaya konversi per kg' })).toBeTruthy();
        expect(screen.getByText('tenaga kerja, listrik, mesin jadi satu angka')).toBeTruthy();
        expect(screen.getByRole('textbox', { name: 'Overhead %' })).toBeTruthy();
        expect(screen.getByText('dari bahan + susut + tenaga')).toBeTruthy();
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

    it('shows a read-only total of the non-percentage costs when a stage has several of them', () => {
        renderClient();

        expect(screen.queryByRole('textbox', { name: 'Tenaga / biaya konversi per kg' })).toBeNull();
        expect(screen.getByText('2 komponen biaya, ubah di Lanjutan')).toBeTruthy();
        expect(screen.getByTestId('conversion-total').textContent).toBe(formatRupiah(650 + 420));
        expect(overheadInput().value).toBe('5');
    });

    it('updates the stage HPP and enables Simpan when the conversion cost is edited', () => {
        renderClient();
        openStage('Packing');
        expect(stageHppText()).toContain(formatRupiah(17696.175 + 216));
        const [dockSave] = screen.getAllByRole('button', { name: /Simpan/ });
        expect((dockSave as HTMLButtonElement).disabled).toBe(true);

        fireEvent.change(screen.getByRole('textbox', { name: 'Tenaga / biaya konversi per kg' }), {
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

        fireEvent.change(screen.getByRole('textbox', { name: 'Tenaga / biaya konversi per kg' }), {
            target: { value: '500' },
        });

        expect(stageHppText()).toContain(formatRupiah(500));
    });

    it('adds a cost line from Lanjutan and reflects it in the main card note', () => {
        renderClient();

        fireEvent.change(screen.getByRole('combobox', { name: 'Tambah biaya' }), {
            target: { value: 'fixed-per-output' },
        });

        expect(screen.getByText('3 komponen biaya, ubah di Lanjutan')).toBeTruthy();
    });

    it('saves the workspace and reports the result', async () => {
        renderClient();
        openStage('Packing');
        fireEvent.change(screen.getByRole('textbox', { name: 'Tenaga / biaya konversi per kg' }), {
            target: { value: '300' },
        });

        fireEvent.click(screen.getAllByRole('button', { name: /Simpan/ })[0]);

        await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('Tersimpan.'));
        expect(mocks.save).toHaveBeenCalledTimes(1);
        expect(mocks.save.mock.calls[0][1]).toBe(UPDATED_AT);
    });

    it('right-aligns the number column headers and left-aligns the material header', () => {
        renderClient();

        const headers = within(screen.getByTestId('material-headers'));

        expect(headers.getByText('Bahan').className).toContain('text-left');
        ['Jumlah', 'Susut %', 'Harga per unit', 'Subtotal'].forEach((label) => {
            expect(headers.getByText(label).className).toContain('text-right');
        });
    });

    it('shows a Susut % field on every material row and not again under Lanjutan', () => {
        renderClient();

        expect(screen.getAllByRole('textbox', { name: 'Susut %' })).toHaveLength(3);

        openStage('Potong');
        const [scrap] = screen.getAllByRole('textbox', { name: 'Susut %' });
        expect(screen.getAllByRole('textbox', { name: 'Susut %' })).toHaveLength(1);
        expect((scrap as HTMLInputElement).value).toBe('5');
    });

    it('changes the stage HPP when the scrap percent is edited in the row', () => {
        renderClient();
        const [resinScrap] = screen.getAllByRole('textbox', { name: 'Susut %' });

        fireEvent.change(resinScrap, { target: { value: '10' } });

        const pre = 0.92 * 14500 * 1.1 + 0.03 * 38000 + 0.05 * 2400 + 650 + 420;
        expect(stageHppText()).toContain(formatRupiah(pre * 1.05));
    });

    it('explains scrap under the material list', () => {
        renderClient();

        expect(
            screen.getByText('Susut % = tambahan di atas jumlah (afval 20% dari input ≈ susut 25%)'),
        ).toBeTruthy();
    });

    it('shows each material unit dimmed beside its quantity', () => {
        renderClient();

        const [quantity] = screen.getAllByRole('textbox', { name: 'Jumlah' });

        expect(quantity.parentElement?.textContent).toBe('kg');
    });

    it('uses the unit of the source stage for a stage material', () => {
        renderClient();
        openStage('Potong');

        const [quantity] = screen.getAllByRole('textbox', { name: 'Jumlah' });

        expect(quantity.parentElement?.textContent).toBe('kg');
    });

    it('keeps the source tag on the name line and moves the ERP hint into a tooltip', () => {
        renderClient();

        const names = screen.getAllByLabelText('Nama bahan');
        const edited = names[1].parentElement as HTMLElement;

        expect(edited.textContent).toContain('diubah');
        expect(edited.textContent).not.toContain('ERP');
        expect(edited.getAttribute('title')).toBe('ERP 36.500');
        expect((names[0].parentElement as HTMLElement).textContent).toContain('ERP');
    });

    it('recomputes the stage HPP when Overhead % is edited and drops the line at 0', () => {
        renderClient();
        expect(stageHppText()).toContain(formatRupiah(EXTRUSION_PRE_OVERHEAD * 1.05));

        fireEvent.change(overheadInput(), { target: { value: '10' } });
        expect(stageHppText()).toContain(formatRupiah(EXTRUSION_PRE_OVERHEAD * 1.1));

        fireEvent.change(overheadInput(), { target: { value: '0' } });
        expect(stageHppText()).toContain(formatRupiah(EXTRUSION_PRE_OVERHEAD));
        expect(screen.getByText('2 komponen biaya, ubah di Lanjutan')).toBeTruthy();
    });

    it('adds a stage-level overhead on a stage that has none', () => {
        renderClient();
        openStage('Packing');

        fireEvent.change(overheadInput(), { target: { value: '10' } });

        expect(stageHppText()).toContain(formatRupiah((17696.175 + 216) * 1.1));
    });

    it('adds a ready-made extrusion scenario from the template action', () => {
        renderClient();
        const details = within(screen.getByText('Lanjutan').closest('details') as HTMLElement);

        fireEvent.click(details.getByRole('button', { name: /Dari template/ }));

        expect(screen.getByText('Ekstrusi HDPE · per 1 kg keluaran')).toBeTruthy();
        expect(screen.getAllByLabelText('Nama bahan')).toHaveLength(4);
        expect(overheadInput().value).toBe('10');
        expect(screen.getByText('4 bahan masih belum berharga.')).toBeTruthy();
    });
});
