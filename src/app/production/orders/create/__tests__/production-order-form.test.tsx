// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { ProductionOrderForm } from '../production-order-form';
import { getBomWithInventory, createProductionOrder } from '@/actions/production/production';
import { getRealtimeStock } from '@/actions/inventory/inventory';

vi.mock('@/actions/inventory/inventory', () => ({ getRealtimeStock: vi.fn() }));

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

describe('ProductionOrderForm — direct packing', () => {
    it.each([false, true])('submits per-material sources; switching back to transfer=%s', async (switchBack) => {
        vi.mocked(createProductionOrder).mockReset();
        vi.mocked(createProductionOrder).mockResolvedValue({ success: true, data: { id: 'po' } } as never);
        vi.mocked(getRealtimeStock).mockResolvedValue({ success: true, data: 100 });
        mockedGetBom.mockResolvedValue({ success: true, data: { data: ['a', 'b'].map((id, index) => ({
            productVariantId: id, name: `Bahan ${id.toUpperCase()}`, unit: 'KG', stdQty: 10, bomOutput: 1000,
            requiredQty: index === 0 ? 3 : 6, currentStock: 100, totalStock: 100,
            sourceLocationId: index === 0 ? 'loc-fg' : 'loc-rm', sourceLocationName: index === 0 ? 'Gudang Hasil' : 'Gudang Pengemas',
        })), meta: {} } } as never);
        const packingLocations = [
            { id: 'loc-rm', name: 'Gudang Pengemas', slug: 'gudang-packaging', locationPurpose: 'PACKING' },
            { id: 'loc-fg', name: 'Gudang Hasil', slug: 'fg_warehouse', locationPurpose: 'FINISHED_GOOD' },
        ];
        const bom = { ...makeBom('packing-bom', 'Resep Packing'), category: 'PACKING' as const, productVariant: { ...productVariant, name: 'Produk Packing', product: { productType: 'FINISHED_GOOD' } } };
        render(<ProductionOrderForm locations={packingLocations} machines={[]} boms={[bom]} rawMaterials={[]} customers={[{ id: 'ca', name: 'Synthetic Customer A' }, { id: 'cb', name: 'Synthetic Customer B' }]} />);
        fireEvent.click(screen.getByRole('button', { name: 'Packing' }));
        fireEvent.change(document.querySelector('input[type="number"]')!, { target: { value: '300' } });
        await act(async () => { vi.advanceTimersByTime(500); });
        fireEvent.click(screen.getByText('Lanjut →'));
        fireEvent.click(screen.getByLabelText('Synthetic Customer A'));
        fireEvent.click(screen.getByLabelText('Synthetic Customer B'));
        fireEvent.click(screen.getByRole('radio', { name: /Langsung per bahan/i }));
        await act(async () => { await Promise.resolve(); });
        if (switchBack) fireEvent.click(screen.getByRole('radio', { name: /Transfer ke satu lokasi/i }));
        fireEvent.click(screen.getByText('Lanjut →'));
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Buat SPK' })); });
        expect(createProductionOrder).toHaveBeenCalledWith(expect.objectContaining({
            customerIds: ['ca', 'cb'],
            materialConsumptionMode: switchBack ? 'TRANSFER' : 'DIRECT',
            materialConsumptionLocationId: switchBack ? 'loc-fg' : undefined,
            items: [
                { productVariantId: 'a', quantity: 3, ...(switchBack ? {} : { sourceLocationId: 'loc-fg' }) },
                { productVariantId: 'b', quantity: 6, ...(switchBack ? {} : { sourceLocationId: 'loc-rm' }) },
            ],
        }));
    });
});

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

describe('ProductionOrderForm — Tambah bahan (manual add, gudang-first)', () => {
    it('flags a manually-added material as short once its qty exceeds stock at the chosen gudang', async () => {
        render(
            <ProductionOrderForm
                locations={locations}
                machines={[]}
                boms={[makeBom('bom-1', 'Resep A')]}
                rawMaterials={[
                    { id: 'rm-manual', name: 'Bahan Manual', primaryUnit: 'KG' },
                ]}
                rawMaterialStock={[
                    {
                        productVariantId: 'rm-manual',
                        locationId: 'loc-rm',
                        quantity: 5,
                    },
                ]}
            />,
        );

        fireEvent.click(screen.getByText('Campuran Test'));
        const initialQtyInput = document.querySelector(
            'input[type="number"]',
        ) as HTMLInputElement;
        fireEvent.change(initialQtyInput, { target: { value: '300' } });
        await act(async () => {
            vi.advanceTimersByTime(500);
        });
        fireEvent.click(screen.getByText('Lanjut →'));
        fireEvent.click(screen.getByText('Lanjut →'));
        await act(async () => {
            vi.advanceTimersByTime(500);
        });

        expect(screen.queryByText('Kekurangan bahan')).toBeNull();

        // Gudang first, then item — matches the picker's intended order.
        // "Gudang Bahan Baku" also appears as plain text in the "Alur
        // material" summary, so scope to the mocked SelectItem <button>.
        const gudangOption = screen
            .getAllByText('Gudang Bahan Baku')
            .find((el) => el.closest('button'));
        fireEvent.click(gudangOption!.closest('button')!);
        fireEvent.click(screen.getByText('Bahan Manual'));

        const numberInputs = document.querySelectorAll(
            'input[type="number"]',
        );
        const addQtyInput = numberInputs[
            numberInputs.length - 1
        ] as HTMLInputElement;
        fireEvent.change(addQtyInput, { target: { value: '50' } }); // stock is only 5

        fireEvent.click(
            screen.getByRole('button', { name: 'Tambah bahan ke daftar' }),
        );

        // Synchronous state update — fake timers are active in this suite,
        // so findByText's internal polling would never resolve.
        expect(screen.getByText('Kekurangan bahan')).toBeTruthy();
        expect(screen.getByText('Bahan Manual')).toBeTruthy();
    });
});
