// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MaterialPreviewPanel } from '../material-preview-panel';

// Radix Select needs these in jsdom — it isn't implemented there.
vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    },
);
Element.prototype.scrollIntoView = vi.fn();
Element.prototype.hasPointerCapture = vi.fn();
Element.prototype.releasePointerCapture = vi.fn();

function renderPanel(
    overrides: Partial<React.ComponentProps<typeof MaterialPreviewPanel>> = {},
) {
    return render(
        <MaterialPreviewPanel
            sourceLocationName="Gudang Bahan Baku"
            items={[]}
            materialInfo={{}}
            suggestedSource={null}
            isCalculating={false}
            hasStockIssues={false}
            onAcceptSuggestedSource={() => {}}
            {...overrides}
        />,
    );
}

describe('MaterialPreviewPanel', () => {
    it.each(['DIRECT', 'TRANSFER'] as const)('keeps shortage/estimate visible and explains %s calculation only in help', async (consumptionMode) => {
        renderPanel({ consumptionMode, hasStockIssues: true });
        expect(screen.getByText('Estimasi, bukan reservasi stok.')).toBeTruthy();
        expect(screen.getByText('Kekurangan bahan')).toBeTruthy();
        expect(screen.queryByText(/Kecukupan berdasarkan|Kecukupan bahan resep/)).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Info kecukupan bahan' }));
        expect((await screen.findByRole('tooltip')).textContent).toContain(consumptionMode === 'DIRECT' ? 'dipilih per bahan' : 'total stok gudang');
    });
    it('shows the "belum diisi" placeholder when there is no error and no items', () => {
        renderPanel();

        expect(screen.getByText('Pilih produk & target dulu')).toBeTruthy();
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('renders a destructive alert distinct from the placeholder when the calculation failed', () => {
        renderPanel({ error: 'Recipe not found' });

        const alert = screen.getByRole('alert');
        expect(alert.textContent).toContain('Gagal menghitung kebutuhan bahan');
        expect(alert.textContent).toContain('Coba lagi atau hubungi admin.');
        // The empty-state placeholder should still render underneath the alert.
        expect(screen.getByText('Pilih produk & target dulu')).toBeTruthy();
    });

    it('keeps a failed recalculation visible even when previous material rows remain', () => {
        renderPanel({
            error: 'Recipe not found',
            items: [{ productVariantId: 'pv-1', quantity: 10 }],
            materialInfo: {
                'pv-1': {
                    productVariantId: 'pv-1',
                    name: 'PP Hijau D',
                    unit: 'KG',
                    stdQty: 1,
                    bomOutput: 1,
                    currentStock: 100,
                    totalStock: 100,
                    sourceLocationId: 'loc-1',
                    sourceLocationName: 'Gudang Bahan Baku',
                },
            },
        });

        expect(screen.getByRole('alert').textContent).toContain(
            'Gagal menghitung kebutuhan bahan',
        );
        expect(screen.getByText('PP Hijau D')).toBeTruthy();
    });

    describe('Tambah bahan — gudang first', () => {
        const rawMaterials = [
            { id: 'rm-1', name: 'PP Karung', primaryUnit: 'KG' },
        ];
        const sourceLocations = [{ id: 'loc-1', name: 'Gudang Bahan Baku' }];

        it('disables the item picker until a gudang is chosen', () => {
            renderPanel({ editable: true, rawMaterials, sourceLocations });

            const [, itemPicker] = screen.getAllByRole(
                'combobox',
            ) as HTMLButtonElement[];
            expect(itemPicker.disabled).toBe(true);
        });

        it('enables the item picker once a default gudang is provided, and shows stock per item', async () => {
            renderPanel({
                editable: true,
                rawMaterials,
                sourceLocations,
                defaultLocationId: 'loc-1',
                rawMaterialStock: { 'rm-1': { 'loc-1': 925 } },
            });

            const [, itemPicker] = screen.getAllByRole(
                'combobox',
            ) as HTMLButtonElement[];
            expect(itemPicker.disabled).toBe(false);

            fireEvent.click(itemPicker);
            expect(await screen.findByText('PP Karung')).toBeTruthy();
            expect(screen.getByText('Stok: 925 KG')).toBeTruthy();
        });

        it('calls onAddItem with the chosen gudang as the third argument', async () => {
            const onAddItem = vi.fn();
            renderPanel({
                editable: true,
                rawMaterials,
                sourceLocations,
                defaultLocationId: 'loc-1',
                onAddItem,
            });

            const [, itemPicker] = screen.getAllByRole('combobox');
            fireEvent.click(itemPicker);
            fireEvent.click(await screen.findByText('PP Karung'));

            fireEvent.change(screen.getByRole('spinbutton'), {
                target: { value: '10' },
            });
            fireEvent.click(
                screen.getByRole('button', { name: 'Tambah bahan ke daftar' }),
            );

            expect(onAddItem).toHaveBeenCalledWith('rm-1', 10, 'loc-1');
        });
    });
});
