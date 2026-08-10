// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { ProductionOrderForm } from '../production-order-form';
import { getBomWithInventory } from '@/actions/production/production';

vi.stubGlobal(
    'ResizeObserver',
    class {
        observe() {}
        unobserve() {}
        disconnect() {}
    },
);
Element.prototype.scrollIntoView = vi.fn();

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('sonner', () => ({
    toast: { warning: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/actions/production/production', () => ({
    getBomWithInventory: vi.fn(),
    createProductionOrder: vi.fn(),
}));

// Generic Select mock — SelectItem renders as a clickable button carrying the
// real `value`, so tests can pick an option without fighting Radix's
// pointer-capture/portal behavior in jsdom.
const SelectValueCtx = React.createContext<(v: string) => void>(() => {});
vi.mock('@/components/ui/select', () => ({
    Select: ({
        children,
        onValueChange,
    }: {
        children: React.ReactNode;
        onValueChange: (v: string) => void;
    }) => (
        <SelectValueCtx.Provider value={onValueChange}>
            <div>{children}</div>
        </SelectValueCtx.Provider>
    ),
    SelectTrigger: ({ children }: { children: React.ReactNode }) => (
        <div>{children}</div>
    ),
    SelectValue: ({ placeholder }: { placeholder?: string }) => (
        <span>{placeholder}</span>
    ),
    SelectContent: ({ children }: { children: React.ReactNode }) => (
        <div>{children}</div>
    ),
    SelectItem: ({
        children,
        value,
    }: {
        children: React.ReactNode;
        value: string;
    }) => {
        const onValueChange = React.useContext(SelectValueCtx);
        return (
            <button type="button" onClick={() => onValueChange(value)}>
                {children}
            </button>
        );
    },
}));

const mockedGetBom = vi.mocked(getBomWithInventory);

const locations = [
    {
        id: 'loc-rm',
        slug: 'gudang-bahan-baku',
        name: 'Gudang Bahan Baku',
        locationPurpose: 'RAW_MATERIAL',
    },
    {
        id: 'loc-wip',
        slug: 'gudang-wip',
        name: 'Gudang WIP',
        locationPurpose: 'WIP',
    },
];

const productVariant = {
    name: 'Campuran Test',
    primaryUnit: 'KG',
    product: { productType: 'INTERMEDIATE' },
};

function makeBom(id: string, name: string) {
    return {
        id,
        name,
        isDefault: false,
        productVariantId: 'pv-product',
        category: 'MIXING' as const,
        outputQuantity: 1000,
        productVariant,
        items: [
            { productVariantId: 'a', quantity: 10 },
            { productVariantId: 'b', quantity: 20 },
        ],
    };
}

function baseMaterials() {
    return {
        success: true,
        data: {
            data: [
                {
                    productVariantId: 'a',
                    name: 'Bahan A',
                    unit: 'KG',
                    stdQty: 10,
                    bomOutput: 1000,
                    requiredQty: 3,
                    currentStock: 100,
                    totalStock: 100,
                    sourceLocationId: 'loc-rm',
                    sourceLocationName: 'Gudang Bahan Baku',
                },
                {
                    productVariantId: 'b',
                    name: 'Bahan B',
                    unit: 'KG',
                    stdQty: 20,
                    bomOutput: 1000,
                    requiredQty: 6,
                    currentStock: 100,
                    totalStock: 100,
                    sourceLocationId: 'loc-rm',
                    sourceLocationName: 'Gudang Bahan Baku',
                },
            ],
            meta: {},
        },
    } as never;
}

async function reachStep3() {
    render(
        <ProductionOrderForm
            locations={locations}
            machines={[]}
            boms={[makeBom('bom-1', 'Resep A')]}
            rawMaterials={[]}
        />,
    );

    // Step 1: pick product (auto-selects the only matching BOM), set target qty
    fireEvent.click(screen.getByText('Campuran Test'));

    const qtyInput = document.querySelector(
        'input[type="number"]',
    ) as HTMLInputElement;
    fireEvent.change(qtyInput, { target: { value: '300' } });

    await act(async () => {
        vi.advanceTimersByTime(500);
    });

    fireEvent.click(screen.getByText('Lanjut →'));
    fireEvent.click(screen.getByText('Lanjut →'));
}

beforeEach(() => {
    vi.useFakeTimers();
    mockedGetBom.mockReset();
    mockedGetBom.mockResolvedValue(baseMaterials());
});

afterEach(() => {
    vi.useRealTimers();
});

function removeRow(name: string) {
    const row = screen.getByText(name).closest('tr') as HTMLElement;
    // The qty <Input> isn't a <button>; the trash-icon button is the only
    // <button> left in the row.
    const buttons = Array.from(row.querySelectorAll('button'));
    fireEvent.click(buttons[buttons.length - 1]);
}

describe('ProductionOrderForm — editable material list (step 3)', () => {
    it('keeps a removed material line removed after the debounce window passes again', async () => {
        await reachStep3();

        await act(async () => {
            vi.advanceTimersByTime(500);
        });

        expect(screen.getByText('Bahan A')).toBeTruthy();
        expect(screen.getByText('Bahan B')).toBeTruthy();

        removeRow('Bahan A');

        expect(screen.queryByText('Bahan A')).toBeNull();
        expect(screen.getByText('Bahan B')).toBeTruthy();

        // Let any pending debounce / re-render settle — the removal must survive.
        await act(async () => {
            vi.advanceTimersByTime(2000);
        });

        expect(screen.queryByText('Bahan A')).toBeNull();
        expect(screen.getByText('Bahan B')).toBeTruthy();
    });

    it('keeps a removed line after going back to Step 1 and adjusting target qty, then returning to Step 3 (regression: reset-on-qty revert)', async () => {
        await reachStep3();
        await act(async () => {
            vi.advanceTimersByTime(500);
        });

        removeRow('Bahan A');
        expect(screen.queryByText('Bahan A')).toBeNull();

        // Go back to Step 1 and nudge the target quantity — this is the field
        // that used to reset the "user has edited" flag and silently restore
        // the full BOM-derived list.
        fireEvent.click(screen.getByText('Kembali'));
        fireEvent.click(screen.getByText('Kembali'));
        const qtyInput = document.querySelector(
            'input[type="number"]',
        ) as HTMLInputElement;
        fireEvent.change(qtyInput, { target: { value: '350' } });
        await act(async () => {
            vi.advanceTimersByTime(500);
        });

        fireEvent.click(screen.getByText('Lanjut →'));
        fireEvent.click(screen.getByText('Lanjut →'));
        await act(async () => {
            vi.advanceTimersByTime(500);
        });

        expect(screen.queryByText('Bahan A')).toBeNull();
        expect(screen.getByText('Bahan B')).toBeTruthy();
    });

    it('resets to the full recipe list when a different BOM is selected (intentional fresh start)', async () => {
        render(
            <ProductionOrderForm
                locations={locations}
                machines={[]}
                boms={[makeBom('bom-1', 'Resep A'), makeBom('bom-2', 'Resep B')]}
                rawMaterials={[]}
            />,
        );

        await act(async () => {
            fireEvent.click(screen.getByText('Campuran Test'));
        });
        await act(async () => {
            fireEvent.click(screen.getByText('Resep A'));
        });

        const qtyInput = document.querySelector(
            'input[type="number"]',
        ) as HTMLInputElement;
        fireEvent.change(qtyInput, { target: { value: '300' } });
        await act(async () => {
            vi.advanceTimersByTime(500);
        });

        fireEvent.click(screen.getByText('Lanjut →'));
        fireEvent.click(screen.getByText('Lanjut →'));
        await act(async () => {
            vi.advanceTimersByTime(500);
        });

        removeRow('Bahan A');
        expect(screen.queryByText('Bahan A')).toBeNull();

        // Go back to Step 1 and pick the OTHER recipe — a genuine "start over".
        fireEvent.click(screen.getByText('Kembali'));
        fireEvent.click(screen.getByText('Kembali'));
        await act(async () => {
            fireEvent.click(screen.getByText('Resep B'));
        });
        await act(async () => {
            vi.advanceTimersByTime(500);
        });

        fireEvent.click(screen.getByText('Lanjut →'));
        fireEvent.click(screen.getByText('Lanjut →'));
        await act(async () => {
            vi.advanceTimersByTime(500);
        });

        // Fresh recipe → fresh list, Bahan A is back (this is correct, not a bug).
        expect(screen.getByText('Bahan A')).toBeTruthy();
        expect(screen.getByText('Bahan B')).toBeTruthy();
    });
});
