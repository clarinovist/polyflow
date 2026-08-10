// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MaterialPreviewPanel } from '../material-preview-panel';

function renderPanel(
    overrides: Partial<
        React.ComponentProps<typeof MaterialPreviewPanel>
    > = {},
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

    it('does not render the error alert once items are present, even if a stale error lingers', () => {
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

        expect(screen.queryByRole('alert')).toBeNull();
        expect(screen.getByText('PP Hijau D')).toBeTruthy();
    });
});
