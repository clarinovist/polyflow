import { describe, expect, it } from 'vitest';
import {
    buildInitialGroups,
    estimateUsageNeeds,
    packagingStepProblem,
    pickSource,
    selectableStock,
    switchGroupBrand,
    type KioskPackagingContext,
} from '../kiosk-packaging';

const stockRow = (id: string, productVariantId: string, name: string, unit: string, locationId: string, quantity: number) => ({
    id, productVariantId, name, unit, locationId, locationName: `Gudang ${locationId}`, ownerCustomerId: null, ownerName: null, quantity,
});

const context: KioskPackagingContext = {
    enabled: true,
    baseVariantId: 'base',
    fixedBrandId: null,
    brands: [
        { id: 'base', name: 'Produk dasar', labelVariantId: null, labelName: null },
        { id: 'brand-a', name: 'Merek A', labelVariantId: 'label-a', labelName: 'Etiket A' },
        { id: 'brand-b', name: 'Merek B', labelVariantId: 'label-b', labelName: 'Etiket B' },
    ],
    plannedPackagingIds: ['sack'],
    stock: [
        stockRow('s1', 'label-a', 'Etiket A', 'PCS', 'pack', 3000),
        stockRow('s2', 'label-b', 'Etiket B', 'PCS', 'pack', 600),
        stockRow('s3', 'sack', 'Karung', 'PCS', 'pack', 400),
        stockRow('s4', 'sack', 'Karung', 'PCS', 'main', 900),
        stockRow('s5', 'film', 'Plastik', 'KG', 'pack', 38),
    ],
    usage: [
        { productVariantId: 'sack', name: 'Karung', unit: 'PCS', quantity: 16, lastSourceLocationId: 'pack' },
        { productVariantId: 'film', name: 'Plastik', unit: 'KG', quantity: 2.4, lastSourceLocationId: 'gone' },
    ],
    producedBaseQty: 80,
};

describe('pickSource', () => {
    it('prefers the source used last on this SPK, then the largest stock', () => {
        expect(pickSource(context, 'sack')?.locationId).toBe('pack');
        expect(pickSource(context, 'film')?.locationId).toBe('pack');
        expect(pickSource(context, 'label-a')?.locationId).toBe('pack');
        expect(pickSource({ ...context, usage: [] }, 'sack')?.locationId).toBe('main');
        expect(pickSource(context, 'unknown')).toBeUndefined();
    });
});

describe('buildInitialGroups', () => {
    it('records nothing when there is no good output', () => {
        expect(buildInitialGroups(context, 0)).toEqual([]);
    });

    it('prefills planned packaging and what this SPK used before, with empty counts', () => {
        const [group] = buildInitialGroups(context, 25);

        expect(group.productVariantId).toBe('base');
        expect(group.quantity).toBe(25);
        expect(group.packaging.map((row) => [row.productVariantId, row.sourceLocationId, row.unit, row.quantity])).toEqual([
            ['sack', 'pack', 'PCS', 0],
            ['film', 'pack', 'KG', 0],
        ]);
    });

    it('uses the brand the SPK was made for, with its label first', () => {
        const [group] = buildInitialGroups({ ...context, fixedBrandId: 'brand-a', brands: [context.brands[1]] }, 25);

        expect(group.productVariantId).toBe('brand-a');
        expect(group.packaging[0]).toMatchObject({ productVariantId: 'label-a', sourceLocationId: 'pack' });
    });

    it('leaves the source empty when a planned item has no stock', () => {
        const [group] = buildInitialGroups({ ...context, plannedPackagingIds: ['no-stock'], usage: [] }, 10);

        expect(group.packaging).toEqual([{ productVariantId: 'no-stock', sourceLocationId: '', ownerCustomerId: null, unit: undefined, quantity: 0 }]);
    });
});

describe('switchGroupBrand', () => {
    it('swaps the label row to the new brand and keeps other rows', () => {
        const groups = buildInitialGroups(context, 25);
        const toA = switchGroupBrand(context, groups, 0, 'brand-a');
        const toB = switchGroupBrand(context, toA, 0, 'brand-b');
        const back = switchGroupBrand(context, toB, 0, 'base');

        expect(toA[0].packaging.map((row) => row.productVariantId)).toEqual(['label-a', 'sack', 'film']);
        expect(toB[0]).toMatchObject({ productVariantId: 'brand-b' });
        expect(toB[0].packaging.map((row) => row.productVariantId)).toEqual(['label-b', 'sack', 'film']);
        expect(back[0].packaging.map((row) => row.productVariantId)).toEqual(['sack', 'film']);
        expect(groups[0].productVariantId).toBe('base');
    });
});

describe('selectableStock', () => {
    it('hides labels that belong to brands not being recorded', () => {
        const ids = selectableStock(context, ['brand-a']).map((row) => row.productVariantId);

        expect(ids).toContain('label-a');
        expect(ids).not.toContain('label-b');
        expect(ids).toContain('sack');
    });
});

describe('packagingStepProblem', () => {
    const filled = () => {
        const [group] = switchGroupBrand(context, buildInitialGroups(context, 25), 0, 'brand-a');
        return [{ ...group, packaging: group.packaging.map((row) => ({ ...row, quantity: row.productVariantId === 'film' ? 0.8 : 5 })) }];
    };

    it('accepts a complete entry and an output of zero', () => {
        expect(packagingStepProblem(context, filled(), 25, 'KG')).toBeNull();
        expect(packagingStepProblem(context, [], 0, 'KG')).toBeNull();
    });

    it('requires a brand group when there is output', () => {
        expect(packagingStepProblem(context, [], 25, 'KG')).toBe('Pilih merek hasil.');
    });

    it('requires at least one packaging row per brand, as the server does', () => {
        expect(packagingStepProblem(context, [{ productVariantId: 'brand-a', quantity: 25, packaging: [] }], 25, 'KG'))
            .toBe('Catat minimal satu kemasan untuk Merek A.');
        expect(packagingStepProblem(context, [{ productVariantId: 'gone', quantity: 25, packaging: [] }], 25, 'KG'))
            .toBe('Catat minimal satu kemasan untuk merek ini.');
    });

    it('requires the mapped label and every planned item', () => {
        const groups = filled();
        const noLabel = [{ ...groups[0], packaging: groups[0].packaging.filter((row) => row.productVariantId !== 'label-a') }];
        const noSack = [{ ...groups[0], packaging: groups[0].packaging.filter((row) => row.productVariantId !== 'sack') }];

        expect(packagingStepProblem(context, noLabel, 25, 'KG')).toBe('Etiket A wajib dicatat untuk Merek A.');
        expect(packagingStepProblem(context, noSack, 25, 'KG')).toBe('Catat juga Karung yang ada di rencana SPK.');
    });

    it('checks every row: source, count, whole numbers, stock and duplicates', () => {
        const base = filled()[0];
        const withRow = (patch: object) => [{ ...base, packaging: base.packaging.map((row, i) => (i === 0 ? { ...row, ...patch } : row)) }];

        expect(packagingStepProblem(context, withRow({ sourceLocationId: '' }), 25, 'KG')).toBe('Pilih gudang asal untuk Etiket A.');
        expect(packagingStepProblem(context, withRow({ quantity: 0 }), 25, 'KG')).toBe('Isi jumlah Etiket A yang terpakai.');
        expect(packagingStepProblem(context, withRow({ quantity: 2.5 }), 25, 'KG')).toBe('Jumlah Etiket A harus bilangan bulat.');
        expect(packagingStepProblem(context, withRow({ quantity: 3001 }), 25, 'KG')).toBe('Stok Etiket A di Gudang pack hanya 3.000 pcs / lembar.');
        const duplicate = [{ ...base, packaging: [...base.packaging, base.packaging[1]] }];
        expect(packagingStepProblem(context, duplicate, 25, 'KG')).toBe('Gabungkan baris Karung dari gudang yang sama.');
        const unknownSource = withRow({ sourceLocationId: 'nowhere' });
        expect(packagingStepProblem(context, unknownSource, 25, 'KG')).toBe('Pilih gudang asal untuk Etiket A.');
        const unnamed = [{ ...base, packaging: [{ productVariantId: '', sourceLocationId: '', ownerCustomerId: null, quantity: 0 }] }];
        expect(packagingStepProblem({ ...context, plannedPackagingIds: [] }, unnamed, 25, 'KG')).toBe('Pilih kemasan untuk setiap baris.');
    });

    it('requires two brands to add up to the output', () => {
        const [a] = filled();
        const b = { ...switchGroupBrand(context, [a], 0, 'brand-b')[0], quantity: 10 };
        const bFilled = { ...b, packaging: b.packaging.map((row) => ({ ...row, quantity: row.productVariantId === 'film' ? 0.4 : 3 })) };

        expect(packagingStepProblem(context, [{ ...a, quantity: 15 }, bFilled], 25, 'KG')).toBeNull();
        expect(packagingStepProblem(context, [{ ...a, quantity: 10 }, bFilled], 25, 'KG')).toBe('Jumlah per merek harus pas 25 KG.');
        expect(packagingStepProblem(context, [{ ...a, quantity: 25 }, { ...bFilled, quantity: 0 }], 25, 'KG')).toBe('Jumlah per merek harus pas 25 KG.');
    });
});

describe('estimateUsageNeeds', () => {
    it('projects remaining need from this SPK average and compares with stock', () => {
        const rows = estimateUsageNeeds(context, 120);

        expect(rows).toEqual([
            expect.objectContaining({ productVariantId: 'sack', perUnit: 0.2, need: 24, stockTotal: 1300, sufficient: true }),
            expect.objectContaining({ productVariantId: 'film', perUnit: 0.03, need: 3.6, stockTotal: 38, sufficient: true }),
        ]);
    });

    it('cannot estimate before any output exists or when nothing remains', () => {
        expect(estimateUsageNeeds({ ...context, producedBaseQty: 0 }, 120).every((row) => row.need === null)).toBe(true);
        expect(estimateUsageNeeds(context, 0).every((row) => row.need === 0 && row.sufficient)).toBe(true);
    });

    it('flags stock that will not last', () => {
        const [sack] = estimateUsageNeeds({ ...context, stock: [stockRow('s3', 'sack', 'Karung', 'PCS', 'pack', 10)] }, 120);

        expect(sack).toMatchObject({ stockTotal: 10, sufficient: false });
    });
});

describe('sourcesFor and newPackagingRow', () => {
    it('lists sources by location and starts a row at the preferred source', async () => {
        const { sourcesFor, newPackagingRow } = await import('../kiosk-packaging');

        expect(sourcesFor(context, 'sack').map((row) => row.locationName)).toEqual(['Gudang main', 'Gudang pack']);
        expect(newPackagingRow(context, 'film')).toEqual({ productVariantId: 'film', sourceLocationId: 'pack', ownerCustomerId: null, unit: 'KG', quantity: 0 });
    });
});
