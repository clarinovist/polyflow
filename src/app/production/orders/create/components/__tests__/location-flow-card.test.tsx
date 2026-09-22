// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LocationFlowCard } from '../location-flow-card';

vi.mock('@/components/ui/form', () => ({
    FormLabel: ({ children }: { children: React.ReactNode }) => (
        <label>{children}</label>
    ),
}));

const locations = [
    {
        id: 'fg',
        name: 'Gudang Barang Jadi & Hasil Produksi',
        slug: 'fg_warehouse',
        locationPurpose: 'FINISHED_GOOD',
    },
    {
        id: 'pack',
        name: 'Gudang Bahan Pembantu & Pengemas',
        slug: 'gudang-packaging',
        locationPurpose: 'PACKING',
    },
];
const props = {
    stage: 'packing' as const,
    sourceLocationName: locations[0].name,
    materialSourceNames: locations.map((l) => l.name),
    outputLocationId: 'fg',
    onOutputLocationChange: vi.fn(),
    consumptionLocationId: 'fg',
    onConsumptionLocationChange: vi.fn(),
    activeLocations: locations,
    recommendedOutputId: 'fg',
    recommendedOutputName: locations[0].name,
    recommendedConsumptionId: 'fg',
    outputIsRisky: false,
    outputIsRecommended: true,
    consumptionManuallyOverridden: false,
    outputManuallyOverridden: false,
    onResetToDefault: vi.fn(),
    onResetConsumptionToDefault: vi.fn(),
    consumptionMode: 'DIRECT' as const,
    onConsumptionModeChange: vi.fn(),
    allowDirect: true,
    materials: [
        {
            productVariantId: 'wrap',
            name: 'Kemasan',
            quantity: 2,
            unit: 'KG',
            sourceLocationId: 'pack',
            sourceLocationName: locations[1].name,
            currentStock: 12,
        },
    ],
    sourceLocations: locations,
    onMaterialSourceChange: vi.fn(),
};

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
describe('material flow layout', () => {
    it('opens help without changing consumption mode or submitting the surrounding form', async () => {
        const submit = vi.fn((e) => e.preventDefault());
        render(<form onSubmit={submit}><LocationFlowCard {...props} outputIsRisky /></form>);
        expect(screen.getByText('Potong stok saat catat hasil.')).toBeTruthy();
        expect(screen.getByRole('alert').textContent).toContain('bukan gudang bahan baku');
        const button = screen.getByRole('button', { name: 'Info cara pemakaian bahan' });
        expect(button.closest('label')).toBeNull();
        fireEvent.click(button);
        expect((await screen.findByRole('tooltip')).textContent).toContain('tanpa issue manual');
        expect(submit).not.toHaveBeenCalled();
        expect(props.onConsumptionModeChange).not.toHaveBeenCalled();
        expect(screen.getByText('Lokasi Penyimpanan Hasil')).toBeTruthy();
    });
    it('does not leave an exit-animation overlay blocking the form', async () => {
        Element.prototype.scrollIntoView = vi.fn();
        render(<LocationFlowCard {...props} />);
        fireEvent.keyDown(screen.getByLabelText('Gudang asal Kemasan'), { key: 'Enter' });
        const menu = await screen.findByRole('listbox');
        expect(menu.style.animation).toBe('none');
        fireEvent.keyDown(menu, { key: 'Escape' });
        expect(screen.queryByRole('listbox')).toBeNull();
        expect(document.body.style.pointerEvents).not.toBe('none');
    });
    it('explains direct consumption and removes the single transfer destination', () => {
        render(<LocationFlowCard {...props} />);
        expect(
            screen.getByRole('radio', { name: /Langsung per bahan/i }),
        ).toBeTruthy();
        expect(screen.queryByText('Lokasi Pemakaian Bahan')).toBeNull();
        expect(screen.getByLabelText('Gudang asal Kemasan')).toBeTruthy();
        expect(screen.getByText('Lokasi Penyimpanan Hasil')).toBeTruthy();
    });
    it('keeps transfer as an explicit selectable option', () => {
        render(<LocationFlowCard {...props} consumptionMode="TRANSFER" />);
        fireEvent.click(
            screen.getByRole('radio', { name: /Langsung per bahan/i }),
        );
        expect(props.onConsumptionModeChange).toHaveBeenCalledWith('DIRECT');
        expect(screen.getByText('Lokasi Pemakaian Bahan')).toBeTruthy();
    });
    it('does not offer direct mode for unsupported orders', () => {
        render(
            <LocationFlowCard
                {...props}
                consumptionMode="TRANSFER"
                allowDirect={false}
            />,
        );
        expect(
            screen.queryByRole('radio', { name: /Langsung per bahan/i }),
        ).toBeNull();
    });
});