// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    render,
    screen,
    fireEvent,
    waitFor,
    within,
} from '@testing-library/react';
import { BatchIssueMaterialDialog } from '../BatchIssueMaterialDialog';
import {
    transferStockBulk,
    getRealtimeStock,
    adjustStock,
} from '@/actions/inventory/inventory';
import { batchIssueMaterials } from '@/actions/production/production';
import { toast } from 'sonner';
import type { ExtendedProductionOrder } from '../types';

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('sonner', () => ({
    toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/actions/production/production', () => ({
    batchIssueMaterials: vi.fn(),
}));

vi.mock('@/actions/inventory/inventory', () => ({
    transferStockBulk: vi.fn(),
    getRealtimeStock: vi.fn(),
    adjustStock: vi.fn(),
}));

const RAW_LOCATION = {
    id: 'loc-rm',
    name: 'Gudang Bahan Baku',
    slug: 'gudang-bahan-baku',
    locationPurpose: 'RAW_MATERIAL',
};

const WIP_LOCATION = {
    id: 'loc-wip',
    name: 'Gudang WIP & Intermediate',
    slug: 'gudang-wip-intermediate',
    locationPurpose: 'WIP',
};

const LOCATIONS = [RAW_LOCATION, WIP_LOCATION] as any;

// Mirrors a real production order pattern: a MIXING order that mixes fresh
// raw material with existing WIP "Campuran Rafia Hijau Tampar" as a top-up
// ingredient — its destination and the WIP item's resolved source are the
// same warehouse, so it should never be treated as a transferable shortage.
function buildOrder(
    overrides: Partial<ExtendedProductionOrder> = {},
): ExtendedProductionOrder {
    return {
        id: 'po-1',
        orderNumber: 'WO-260812-001',
        bom: { category: 'MIXING', name: 'mix rafia hijau tampar' },
        machine: null,
        location: WIP_LOCATION,
        plannedMaterials: [
            {
                id: 'pm-rm',
                productVariantId: 'var-rm-1',
                quantity: 550,
                productVariant: {
                    id: 'var-rm-1',
                    name: 'PP Hijau D',
                    primaryUnit: 'KG',
                    product: { productType: 'RAW_MATERIAL' },
                },
            },
            {
                id: 'pm-wip',
                productVariantId: 'var-wip-1',
                quantity: 525,
                productVariant: {
                    id: 'var-wip-1',
                    name: 'Campuran Rafia Hijau Tampar',
                    primaryUnit: 'KG',
                    product: { productType: 'WIP' },
                },
            },
        ],
        materialIssues: [],
        childOrders: [],
        ...overrides,
    } as unknown as ExtendedProductionOrder;
}

async function openDialog() {
    fireEvent.click(
        screen.getByRole('button', { name: /Transfer Material/i }),
    );
    await screen.findByText('Material');
}

describe('BatchIssueMaterialDialog — WIP self-consumption', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows "tidak perlu transfer" instead of a shortage block when on-hand WIP stock already covers the requirement', async () => {
        (getRealtimeStock as any).mockImplementation(
            (locationId: string, variantId: string) => {
                if (locationId === 'loc-wip' && variantId === 'var-wip-1') {
                    return Promise.resolve({ success: true, data: 600 });
                }
                return Promise.resolve({ success: true, data: 550 });
            },
        );

        render(
            <BatchIssueMaterialDialog
                order={buildOrder()}
                locations={LOCATIONS}
                rawMaterials={[]}
            />,
        );
        await openDialog();

        expect(
            await screen.findByText(/tidak perlu transfer/i),
        ).toBeTruthy();
        // The old generic path (destructive "Atasi Kekurangan" fix-shortage
        // button) must not appear for this self-consumption row.
        expect(screen.queryByText(/Atasi Kekurangan/i)).toBeNull();
    });

    it('shows a WIP shortage hint (not a destination-source transfer error) when on-hand stock is below the requirement', async () => {
        (getRealtimeStock as any).mockImplementation(
            (locationId: string, variantId: string) => {
                if (locationId === 'loc-wip' && variantId === 'var-wip-1') {
                    return Promise.resolve({ success: true, data: 157 });
                }
                return Promise.resolve({ success: true, data: 550 });
            },
        );

        render(
            <BatchIssueMaterialDialog
                order={buildOrder()}
                locations={LOCATIONS}
                rawMaterials={[]}
            />,
        );
        await openDialog();

        expect(
            await screen.findByText(/perlu produksi tambahan/i),
        ).toBeTruthy();
        expect(await screen.findByText(/Kurang 368\.00 KG/i)).toBeTruthy();
    });

    it('excludes the self-consumption WIP line from transferStockBulk while still transferring the raw materials', async () => {
        (getRealtimeStock as any).mockResolvedValue({
            success: true,
            data: 550,
        });
        (transferStockBulk as any).mockResolvedValue({ success: true });
        (batchIssueMaterials as any).mockResolvedValue({
            success: true,
            data: { cappedItems: [] },
        });

        render(
            <BatchIssueMaterialDialog
                order={buildOrder()}
                locations={LOCATIONS}
                rawMaterials={[]}
            />,
        );
        await openDialog();

        fireEvent.click(
            await screen.findByRole('button', { name: /Pindahkan Stok/i }),
        );

        await waitFor(() => expect(transferStockBulk).toHaveBeenCalled());
        const transferredVariantIds = (transferStockBulk as any).mock.calls
            .flatMap(([payload]: any[]) => payload.items)
            .map((i: any) => i.productVariantId);

        expect(transferredVariantIds).toContain('var-rm-1');
        expect(transferredVariantIds).not.toContain('var-wip-1');
    });

    it('warns with the requested-vs-recorded detail when the backend caps a transferred quantity', async () => {
        (getRealtimeStock as any).mockResolvedValue({
            success: true,
            data: 550,
        });
        (transferStockBulk as any).mockResolvedValue({ success: true });
        (batchIssueMaterials as any).mockResolvedValue({
            success: true,
            data: {
                cappedItems: [
                    {
                        productVariantId: 'var-rm-1',
                        name: 'PP Hijau D',
                        requested: 550,
                        recorded: 400,
                    },
                ],
            },
        });

        render(
            <BatchIssueMaterialDialog
                order={buildOrder()}
                locations={LOCATIONS}
                rawMaterials={[]}
            />,
        );
        await openDialog();

        fireEvent.click(
            await screen.findByRole('button', { name: /Pindahkan Stok/i }),
        );

        await waitFor(() =>
            expect(toast.warning).toHaveBeenCalledWith(
                expect.stringContaining(
                    'PP Hijau D: diminta 550 → dicatat 400',
                ),
                expect.anything(),
            ),
        );
    });

    it('toggles the per-item source override on and off', async () => {
        (getRealtimeStock as any).mockResolvedValue({
            success: true,
            data: 550,
        });

        render(
            <BatchIssueMaterialDialog
                order={buildOrder()}
                locations={LOCATIONS}
                rawMaterials={[]}
            />,
        );
        await openDialog();

        fireEvent.click(
            screen.getByRole('button', {
                name: /Ubah asal stok per material/i,
            }),
        );
        expect(
            await screen.findByRole('button', {
                name: /Kembali ke asal otomatis/i,
            }),
        ).toBeTruthy();
    });

    it('closes the dialog via "Batal" without submitting anything', async () => {
        (getRealtimeStock as any).mockResolvedValue({
            success: true,
            data: 550,
        });

        render(
            <BatchIssueMaterialDialog
                order={buildOrder()}
                locations={LOCATIONS}
                rawMaterials={[]}
            />,
        );
        await openDialog();

        fireEvent.click(screen.getByRole('button', { name: /^Batal$/i }));

        await waitFor(() =>
            expect(screen.queryByText('Material')).toBeNull(),
        );
        expect(transferStockBulk).not.toHaveBeenCalled();
    });

    it('issues material directly and warns on capping in non-transfer (STANDARD) mode', async () => {
        (getRealtimeStock as any).mockResolvedValue({
            success: true,
            data: 550,
        });
        (batchIssueMaterials as any).mockResolvedValue({
            success: true,
            data: {
                cappedItems: [
                    {
                        productVariantId: 'var-rm-1',
                        name: 'PP Hijau D',
                        requested: 550,
                        recorded: 300,
                    },
                ],
            },
        });

        const order = buildOrder({
            bom: { category: 'STANDARD', name: 'Standard BOM' } as any,
        });

        render(
            <BatchIssueMaterialDialog
                order={order}
                locations={LOCATIONS}
                rawMaterials={[]}
            />,
        );
        fireEvent.click(
            screen.getByRole('button', { name: /Terbitkan Material/i }),
        );
        await screen.findByText('Material');

        fireEvent.click(
            screen.getByRole('button', { name: /Simpan & Perbarui Rencana/i }),
        );

        await waitFor(() => expect(batchIssueMaterials).toHaveBeenCalled());
        expect(toast.warning).toHaveBeenCalledWith(
            expect.stringContaining('PP Hijau D: diminta 550 → dicatat 300'),
            expect.anything(),
        );
    });

    it('lets an operator edit a planned quantity and undo a removed requirement', async () => {
        (getRealtimeStock as any).mockResolvedValue({
            success: true,
            data: 550,
        });

        render(
            <BatchIssueMaterialDialog
                order={buildOrder()}
                locations={LOCATIONS}
                rawMaterials={[]}
            />,
        );
        await openDialog();

        const qtyInput = (
            await screen.findAllByDisplayValue('550')
        )[0] as HTMLInputElement;
        fireEvent.change(qtyInput, { target: { value: '400' } });
        expect(qtyInput.value).toBe('400');

        const removeButton = screen.getAllByTitle('Hapus Kebutuhan')[0];
        fireEvent.click(removeButton);
        expect(screen.getByTitle('Urungkan Hapus')).toBeTruthy();
        fireEvent.click(screen.getByTitle('Urungkan Hapus'));
        expect(screen.getAllByTitle('Hapus Kebutuhan')).toHaveLength(2);
    });

    it('adds a substitute material row via "Tambah Material Pengganti"', async () => {
        (getRealtimeStock as any).mockResolvedValue({
            success: true,
            data: 550,
        });

        render(
            <BatchIssueMaterialDialog
                order={buildOrder()}
                locations={LOCATIONS}
                rawMaterials={[]}
            />,
        );
        await openDialog();

        fireEvent.click(
            screen.getByRole('button', {
                name: /Tambah Material Pengganti/i,
            }),
        );

        expect(await screen.findByText(/Pilih pengganti/i)).toBeTruthy();

        const rows = screen.getAllByRole('row');
        const substituteRow = rows[rows.length - 1];
        const rowButtons = within(substituteRow).getAllByRole('button');
        fireEvent.click(rowButtons[rowButtons.length - 1]);

        expect(screen.queryByText(/Pilih pengganti/i)).toBeNull();
    });

    it('resolves an insufficient-stock warehouse row via quick stock adjustment (non-transfer / issue mode)', async () => {
        (getRealtimeStock as any).mockResolvedValue({
            success: true,
            data: 100,
        });
        (adjustStock as any).mockResolvedValue({ success: true });

        const order = buildOrder({
            bom: { category: 'STANDARD', name: 'Standard BOM' } as any,
        });

        render(
            <BatchIssueMaterialDialog
                order={order}
                locations={LOCATIONS}
                rawMaterials={[]}
            />,
        );
        fireEvent.click(
            screen.getByRole('button', { name: /Terbitkan Material/i }),
        );
        await screen.findByText('Material');

        const fixButtons = await screen.findAllByRole('button', {
            name: /Atasi Kekurangan/i,
        });
        fireEvent.click(fixButtons[0]);

        const reasonInput = await screen.findByDisplayValue(
            'Ad-hoc production adjustment',
        );
        fireEvent.change(reasonInput, {
            target: { value: 'Stok opname susulan' },
        });

        fireEvent.click(
            await screen.findByRole('button', {
                name: /Konfirmasi Penyesuaian/i,
            }),
        );

        await waitFor(() => expect(adjustStock).toHaveBeenCalled());
        expect(adjustStock).toHaveBeenCalledWith(
            expect.objectContaining({ reason: 'Stok opname susulan' }),
        );
        expect(toast.success).toHaveBeenCalled();
    });

    it('cancels the quick stock adjustment dialog without calling adjustStock', async () => {
        (getRealtimeStock as any).mockResolvedValue({
            success: true,
            data: 100,
        });

        const order = buildOrder({
            bom: { category: 'STANDARD', name: 'Standard BOM' } as any,
        });

        render(
            <BatchIssueMaterialDialog
                order={order}
                locations={LOCATIONS}
                rawMaterials={[]}
            />,
        );
        fireEvent.click(
            screen.getByRole('button', { name: /Terbitkan Material/i }),
        );
        await screen.findByText('Material');

        const fixButtons = await screen.findAllByRole('button', {
            name: /Atasi Kekurangan/i,
        });
        fireEvent.click(fixButtons[0]);
        await screen.findByText(/Penyesuaian Stok Cepat/i);

        const cancelButtons = screen.getAllByRole('button', {
            name: /^Batal$/i,
        });
        fireEvent.click(cancelButtons[cancelButtons.length - 1]);

        await waitFor(() =>
            expect(
                screen.queryByText(/Penyesuaian Stok Cepat/i),
            ).toBeNull(),
        );
        expect(adjustStock).not.toHaveBeenCalled();
    });
});

// Rewinding case: packaging supplies (karung/zak) are handed out whole, never
// weighed to the exact BOM figure — see docs/plan/2026-08-12-rewinding-packaging-floor-buffer.md
const PACKAGING_SUPPLY_LOCATION = {
    id: 'loc-packaging',
    name: 'Gudang Bahan Pembantu & Pengemas',
    slug: 'gudang-packaging',
    locationPurpose: 'PACKING',
};

const FG_LOCATION = {
    id: 'loc-fg',
    name: 'Gudang Barang Jadi & Hasil Produksi',
    slug: 'gudang-barang-jadi',
    locationPurpose: 'FINISHED_GOOD',
};

const PACKAGING_LOCATIONS = [PACKAGING_SUPPLY_LOCATION, FG_LOCATION] as any;

function buildPackagingOrder(
    overrides: Partial<ExtendedProductionOrder> = {},
): ExtendedProductionOrder {
    return {
        id: 'po-2',
        orderNumber: 'WO-260812-002',
        bom: { category: 'PACKING', name: 'Rewinding Karung 25kg' },
        machine: null,
        location: FG_LOCATION,
        plannedMaterials: [
            {
                id: 'pm-pack',
                productVariantId: 'var-pack-1',
                quantity: 18,
                productVariant: {
                    id: 'var-pack-1',
                    name: 'Karung Rewinding 25kg',
                    primaryUnit: 'KG',
                    product: { productType: 'AUXILIARY' },
                    packagingContainerSize: 25,
                },
            },
        ],
        materialIssues: [],
        childOrders: [],
        ...overrides,
    } as unknown as ExtendedProductionOrder;
}

describe('BatchIssueMaterialDialog — packaging floor buffer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('transfers a rounded-up whole container while staging only the planned BOM quantity', async () => {
        (getRealtimeStock as any).mockImplementation(
            (locationId: string, variantId: string) => {
                if (locationId === 'loc-fg' && variantId === 'var-pack-1') {
                    return Promise.resolve({ success: true, data: 0 });
                }
                return Promise.resolve({ success: true, data: 500 });
            },
        );
        (transferStockBulk as any).mockResolvedValue({ success: true });
        (batchIssueMaterials as any).mockResolvedValue({
            success: true,
            data: { cappedItems: [] },
        });

        render(
            <BatchIssueMaterialDialog
                order={buildPackagingOrder()}
                locations={PACKAGING_LOCATIONS}
                rawMaterials={[]}
            />,
        );
        await openDialog();

        expect(
            await screen.findByText(/Transfer dibulatkan ke kontainer utuh/i),
        ).toBeTruthy();

        fireEvent.click(
            await screen.findByRole('button', { name: /Pindahkan Stok/i }),
        );

        await waitFor(() => expect(transferStockBulk).toHaveBeenCalled());
        const transferItems = (transferStockBulk as any).mock.calls.flatMap(
            ([payload]: any[]) => payload.items,
        );
        expect(transferItems).toEqual([
            expect.objectContaining({
                productVariantId: 'var-pack-1',
                quantity: 25,
            }),
        ]);

        await waitFor(() => expect(batchIssueMaterials).toHaveBeenCalled());
        const stagedItems = (batchIssueMaterials as any).mock.calls[0][0]
            .items;
        expect(stagedItems).toEqual([
            expect.objectContaining({
                productVariantId: 'var-pack-1',
                quantity: 18,
            }),
        ]);
    });

    it('skips the transfer when floor stock already covers the plan, but still stages the planned quantity', async () => {
        (getRealtimeStock as any).mockImplementation(
            (locationId: string, variantId: string) => {
                if (locationId === 'loc-fg' && variantId === 'var-pack-1') {
                    return Promise.resolve({ success: true, data: 20 });
                }
                return Promise.resolve({ success: true, data: 500 });
            },
        );
        (batchIssueMaterials as any).mockResolvedValue({
            success: true,
            data: { cappedItems: [] },
        });

        render(
            <BatchIssueMaterialDialog
                order={buildPackagingOrder()}
                locations={PACKAGING_LOCATIONS}
                rawMaterials={[]}
            />,
        );
        await openDialog();

        expect(
            await screen.findByText(/sudah cukup — tidak perlu transfer baru/i),
        ).toBeTruthy();

        fireEvent.click(
            await screen.findByRole('button', { name: /Pindahkan Stok/i }),
        );

        await waitFor(() => expect(batchIssueMaterials).toHaveBeenCalled());
        expect(transferStockBulk).not.toHaveBeenCalled();
        const stagedItems = (batchIssueMaterials as any).mock.calls[0][0]
            .items;
        expect(stagedItems).toEqual([
            expect.objectContaining({
                productVariantId: 'var-pack-1',
                quantity: 18,
            }),
        ]);
    });
});
