// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { KioskPackagingStep } from '../KioskPackagingStep';
import { buildInitialGroups, type KioskPackagingContext } from '@/lib/production/kiosk-packaging';
import type { PackagedOutputValues } from '@/lib/schemas/production-packaging';

type Groups = PackagedOutputValues['groups'];

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
        stockRow('s6', 'tape', 'Lakban', 'PCS', 'pack', 50),
    ],
    usage: [{ productVariantId: 'film', name: 'Plastik', unit: 'KG', quantity: 2.4, lastSourceLocationId: 'pack' }],
    producedBaseQty: 80,
};

function Harness({ baseQty = 25, ctx = context }: { baseQty?: number; ctx?: KioskPackagingContext }) {
    const [groups, setGroups] = useState<Groups>(() => buildInitialGroups(ctx, baseQty));
    return (
        <>
            <KioskPackagingStep context={ctx} isLoading={false} error="" onRetry={() => {}} groups={groups} onChange={setGroups} baseQty={baseQty} unit="KG" />
            <output data-testid="groups">{JSON.stringify(groups)}</output>
        </>
    );
}
const groups = () => JSON.parse(screen.getByTestId('groups').textContent!) as Groups;

const originalScrollIntoView = Element.prototype.scrollIntoView;
beforeAll(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    Element.prototype.scrollIntoView = vi.fn();
});
afterAll(() => {
    vi.unstubAllGlobals();
    Element.prototype.scrollIntoView = originalScrollIntoView;
});
afterEach(cleanup);

describe('KioskPackagingStep', () => {
    it('shows prefilled rows and records the counted quantity', () => {
        render(<Harness />);

        fireEvent.change(screen.getByLabelText('Jumlah Karung'), { target: { value: '5' } });
        fireEvent.change(screen.getByLabelText('Jumlah Plastik'), { target: { value: '0.8' } });

        expect(groups()[0].packaging.map((row) => [row.productVariantId, row.quantity])).toEqual([['sack', 5], ['film', 0.8]]);
        expect(screen.getByText(/termasuk yang rusak/)).toBeTruthy();
    });

    it('swaps the label row when the brand changes', () => {
        render(<Harness />);

        fireEvent.click(screen.getByRole('button', { name: 'Merek A' }));
        expect(groups()[0].productVariantId).toBe('brand-a');
        expect(screen.getByLabelText('Jumlah Etiket A')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Hapus Etiket A' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Hapus Karung' })).toBeNull();
    });

    it('lets the operator move a row to another source and remove optional rows', () => {
        render(<Harness />);

        fireEvent.change(screen.getByLabelText('Gudang Karung'), { target: { value: 'main' } });
        expect(groups()[0].packaging[0]).toMatchObject({ sourceLocationId: 'main', unit: 'PCS' });

        fireEvent.click(screen.getByRole('button', { name: 'Hapus Plastik' }));
        expect(groups()[0].packaging.map((row) => row.productVariantId)).toEqual(['sack']);
    });

    it('adds another packaging material from stock, without other brands\' labels', async () => {
        render(<Harness />);
        fireEvent.click(screen.getByRole('button', { name: 'Merek A' }));

        fireEvent.click(screen.getByRole('combobox', { name: 'Tambah kemasan 1' }));
        expect(screen.queryByRole('option', { name: /Etiket B/ })).toBeNull();
        expect(screen.queryByRole('option', { name: /Karung/ })).toBeNull();
        fireEvent.click(await screen.findByRole('option', { name: /Lakban/ }));

        expect(groups()[0].packaging.map((row) => row.productVariantId)).toEqual(['label-a', 'sack', 'film', 'tape']);
    });

    it('splits output across a second brand and can drop it again', () => {
        render(<Harness />);

        fireEvent.click(screen.getByRole('button', { name: /Merek kedua/ }));
        expect(groups()).toHaveLength(2);
        fireEvent.change(screen.getByLabelText('Jumlah hasil Produk dasar'), { target: { value: '15' } });
        fireEvent.change(screen.getByLabelText(/Jumlah hasil Merek/), { target: { value: '10' } });
        expect(groups().map((group) => group.quantity)).toEqual([15, 10]);

        fireEvent.click(screen.getByRole('button', { name: 'Hapus merek kedua' }));
        expect(groups()).toHaveLength(1);
        expect(groups()[0].quantity).toBe(25);
    });

    it('locks the brand for an SPK made for a specific SKU', () => {
        const fixed = { ...context, fixedBrandId: 'brand-a', brands: [context.brands[1]] };
        render(<Harness ctx={fixed} />);

        expect(screen.queryByRole('button', { name: /Merek kedua/ })).toBeNull();
        expect(screen.getByText('Merek A')).toBeTruthy();
        expect(screen.getByLabelText('Jumlah Etiket A')).toBeTruthy();
    });

    it('explains output zero, loading and load errors', () => {
        const onRetry = vi.fn();
        const { rerender } = render(<KioskPackagingStep context={context} isLoading={false} error="" onRetry={onRetry} groups={[]} onChange={() => {}} baseQty={0} unit="KG" />);
        expect(screen.getByText(/Hasil 0/)).toBeTruthy();

        rerender(<KioskPackagingStep context={null} isLoading error="" onRetry={onRetry} groups={[]} onChange={() => {}} baseQty={25} unit="KG" />);
        expect(screen.getByRole('status').textContent).toMatch(/Memuat/);

        rerender(<KioskPackagingStep context={null} isLoading={false} error="Sesi operator berakhir." onRetry={onRetry} groups={[]} onChange={() => {}} baseQty={25} unit="KG" />);
        expect(screen.getByRole('alert').textContent).toContain('Sesi operator berakhir.');
        fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
        expect(onRetry).toHaveBeenCalled();
    });
});
