// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
    HppPriceSimulatorDefaultDTO,
    HppPriceSimulatorVariantOptionDTO,
} from '@/actions/production/hpp-price-simulator-query';
import {
    hppSimulatorDefaultNumber,
    resolveHppSimulatorUnitCost,
} from '@/lib/production/hpp-price-simulator';
import { SimulatorClient } from '../SimulatorClient';

const mocks = vi.hoisted(() => ({ getDefault: vi.fn() }));

vi.mock('@/actions/production/hpp-price-simulator', () => ({
    getHppPriceSimulatorDefault: mocks.getDefault,
}));

const costSnapshot = resolveHppSimulatorUnitCost({
    inventories: [{ locationType: 'INTERNAL', quantity: 10, averageCost: 100 }],
    standardCost: 90,
    buyPrice: 80,
});

function simulatorDefault(
    id = 'variant-a',
    name = 'Produk A',
): HppPriceSimulatorDefaultDTO {
    return {
        variant: {
            id,
            name,
            skuCode: id.toUpperCase(),
            primaryOutputUnit: 'PCS',
        },
        bom: {
            id: `bom-${id}`,
            name: `BOM ${name}`,
            outputQuantity: hppSimulatorDefaultNumber(100, { source: 'bom' }),
        },
        materials: [
            {
                id: `material-${id}`,
                productVariantId: `rm-${id}`,
                name: `Resin ${name}`,
                skuCode: `RM-${id}`,
                primaryUnit: 'KG',
                quantity: hppSimulatorDefaultNumber(2, { source: 'bom' }),
                scrapPercentage: hppSimulatorDefaultNumber(0, {
                    source: 'bom',
                }),
                unitCost: hppSimulatorDefaultNumber(
                    costSnapshot.value,
                    costSnapshot.metadata,
                ),
                costSource: 'inventory_average',
                costCandidates: costSnapshot.metadata.candidates!,
                costWarnings: costSnapshot.metadata.warnings ?? [],
            },
        ],
    };
}

const defaults = simulatorDefault();
const options: HppPriceSimulatorVariantOptionDTO[] = [
    {
        id: 'variant-a',
        name: 'Produk A',
        skuCode: 'VARIANT-A',
        primaryOutputUnit: 'PCS',
        defaultBom: { id: 'bom-a', name: 'BOM Produk A', outputQuantity: 100 },
    },
    {
        id: 'variant-b',
        name: 'Produk B',
        skuCode: 'VARIANT-B',
        primaryOutputUnit: 'PCS',
        defaultBom: { id: 'bom-b', name: 'BOM Produk B', outputQuantity: 50 },
    },
];

afterEach(() => {
    vi.restoreAllMocks();
});

beforeEach(() => {
    mocks.getDefault.mockResolvedValue({
        success: true,
        data: simulatorDefault('variant-b', 'Produk B'),
    });
});

describe('SimulatorClient', () => {
    it('renders transparent defaults, incomplete labor, reset, and live HPP results', () => {
        render(<SimulatorClient options={options} initialDefault={defaults} />);

        expect(screen.getByText('Rata-rata persediaan internal')).toBeDefined();
        expect(screen.getByText('Belum lengkap')).toBeDefined();
        expect(screen.getAllByText(/Rp\s?2/).length).toBeGreaterThan(0);
        expect(
            screen.getByText(/Ditahan sampai semua biaya lengkap/),
        ).toBeDefined();

        const laborPeople = screen.getByLabelText(
            'Jumlah orang / unit batch',
        );
        const laborCost = screen.getByLabelText(
            'Upah / biaya per unit batch',
        );
        const goodOutput = screen.getByLabelText(
            'Hasil baik per shift / batch',
        );
        fireEvent.change(laborPeople, { target: { value: '2' } });
        fireEvent.change(laborCost, { target: { value: '100000' } });
        fireEvent.change(goodOutput, { target: { value: '1000' } });

        expect(screen.getByText('Lengkap')).toBeDefined();
        expect(screen.getByText(/Rp\s?202/)).toBeDefined();

        const unitCost = screen.getByLabelText('Biaya / KG');
        fireEvent.change(unitCost, { target: { value: '125' } });
        expect(screen.getByText('Override manual')).toBeDefined();
        expect(
            screen.getByText('Default: Rata-rata persediaan internal'),
        ).toBeDefined();
        fireEvent.change(unitCost, { target: { value: '0' } });
        expect(screen.getByText('Rp0 manual')).toBeDefined();
        fireEvent.click(screen.getByRole('button', { name: 'Reset default' }));
        expect(screen.queryByText('Rp0 manual')).toBeNull();
        expect((unitCost as HTMLInputElement).value).toBe('100');
    });

    it('keeps duplicated scenario state isolated and caps comparison at three', () => {
        render(<SimulatorClient options={options} initialDefault={defaults} />);

        fireEvent.click(screen.getByRole('button', { name: 'Duplikat' }));
        expect(screen.getAllByText(/Skenario [12]/).length).toBeGreaterThanOrEqual(2);

        const unitCosts = screen.getAllByLabelText('Biaya / KG');
        fireEvent.change(unitCosts[1], { target: { value: '250' } });
        expect((unitCosts[0] as HTMLInputElement).value).toBe('100');
        expect((unitCosts[1] as HTMLInputElement).value).toBe('250');

        fireEvent.click(screen.getAllByRole('button', { name: 'Duplikat' })[0]);
        expect(screen.getAllByText(/Skenario [123]/).length).toBeGreaterThanOrEqual(3);
        expect(
            screen.getAllByRole('button', { name: 'Duplikat' }).every(
                (button) => (button as HTMLButtonElement).disabled,
            ),
        ).toBe(true);
    });

    it('loads a selected BOM through the guarded action and surfaces failures honestly', async () => {
        const view = render(
            <SimulatorClient options={options} initialDefault={defaults} />,
        );
        fireEvent.change(screen.getByLabelText('Produk / varian'), {
            target: { value: 'variant-b' },
        });

        await waitFor(() =>
            expect(mocks.getDefault).toHaveBeenCalledWith('variant-b'),
        );
        expect(await screen.findByText('BOM Produk B')).toBeDefined();
        expect(screen.getByText('Resin Produk B')).toBeDefined();

        mocks.getDefault.mockResolvedValueOnce({
            success: false,
            error: 'Query biaya gagal',
            code: 'INTERNAL_ERROR',
        });
        fireEvent.change(screen.getByLabelText('Produk / varian'), {
            target: { value: 'variant-a' },
        });
        expect((await screen.findByRole('alert')).textContent).toContain(
            'Query biaya gagal',
        );
        expect(screen.queryByText('Resin Produk A')).toBeNull();

        mocks.getDefault.mockRejectedValueOnce(new Error('transport failed'));
        fireEvent.change(screen.getByLabelText('Produk / varian'), {
            target: { value: 'variant-b' },
        });
        const transportError = await screen.findByRole('alert');
        expect(transportError.textContent).toContain(
            'Data simulator gagal dimuat',
        );
        expect(
            (screen.getByLabelText('Produk / varian') as HTMLSelectElement)
                .disabled,
        ).toBe(false);
        view.unmount();
    });

    it('labels manual zero for every cost-bearing dynamic formula', () => {
        render(<SimulatorClient options={options} initialDefault={defaults} />);

        fireEvent.change(screen.getByLabelText('Jumlah orang / unit batch'), {
            target: { value: '2' },
        });
        fireEvent.change(screen.getByLabelText('Upah / biaya per unit batch'), {
            target: { value: '0' },
        });
        fireEvent.change(screen.getByLabelText('Hasil baik per shift / batch'), {
            target: { value: '100' },
        });
        expect(screen.getByText('Rp0 manual')).toBeDefined();

        fireEvent.change(screen.getByLabelText('Jenis komponen baru'), {
            target: { value: 'fixed-per-output' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Tambah komponen' }));
        fireEvent.change(screen.getByLabelText('Biaya per unit output'), {
            target: { value: '0' },
        });
        expect(screen.getAllByText('Rp0 manual')).toHaveLength(2);
    });
});
