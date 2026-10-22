// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { PackagingOutputFields } from '../PackagingOutputFields';
import type { PackagedOutputValues } from '@/lib/schemas/production-packaging';
import { getProductionPackagingOptions } from '@/actions/production/packaging';
vi.mock('@/actions/production/packaging', () => ({ getProductionPackagingOptions: vi.fn(async () => ({ success: true, data: {
    options: [{ id: 'a', name: 'Brand A', labelVariantId: null }, { id: 'b', name: 'Brand B', labelVariantId: null }],
    stock: [{ id: 'stock', productVariantId: 'sack', name: 'Sack', locationId: 'location', locationName: 'Warehouse', ownerCustomerId: 'customer', ownerName: 'Synthetic owner', quantity: 100, unit: 'PCS' }],
} })) }));
function Harness() {
    const [value, setValue] = useState<PackagedOutputValues>({ clientRequestId: 'ce26b37c-85c5-46cb-bc5c-5ec212db2da4', groups: [{ productVariantId: 'a', quantity: 247, packaging: [] }] });
    return <><PackagingOutputFields baseVariantId="base" baseName="Base" unit="KG" value={value} onChange={setValue} /><output data-testid="value">{JSON.stringify(value)}</output></>;
}
const originalScrollIntoView = Element.prototype.scrollIntoView;
beforeAll(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    Element.prototype.scrollIntoView = vi.fn();
});
afterAll(() => { vi.unstubAllGlobals(); Element.prototype.scrollIntoView = originalScrollIntoView; });
afterEach(cleanup);
async function pickMaterial(name: RegExp) {
    fireEvent.click(screen.getByRole('combobox', { name: 'Kemasan 1-1' }));
    fireEvent.click(await screen.findByRole('option', { name }));
}
describe('PackagingOutputFields', () => {
    it('keeps actual KG independent of selected sack count and preserves source owner', async () => {
        render(<Harness />);
        await waitFor(() => expect(screen.getByText('Tambah kemasan')).toBeTruthy());
        fireEvent.click(screen.getByText('Tambah kemasan'));
        await pickMaterial(/Sack/);
        fireEvent.change(screen.getByLabelText('Gudang kemasan 1-1'), { target: { value: 'stock' } });
        fireEvent.change(screen.getByLabelText('Jumlah kemasan 1-1'), { target: { value: '10' } });
        const value = JSON.parse(screen.getByTestId('value').textContent!);
        expect(value.groups[0]).toMatchObject({ quantity: 247, packaging: [{ quantity: 10, ownerCustomerId: 'customer', sourceLocationId: 'location' }] });
        fireEvent.change(screen.getByLabelText('Jumlah hasil kelompok 1'), { target: { value: '249.5' } });
        expect(JSON.parse(screen.getByTestId('value').textContent!).groups[0].packaging[0].quantity).toBe(10);
    });
    it('shows an actionable empty state and reloads instead of an apparently broken dropdown', async () => {
        vi.mocked(getProductionPackagingOptions).mockResolvedValueOnce({ success: true, data: { options: [], stock: [] } });
        render(<Harness />);
        await screen.findByText(/Belum ada stok kemasan yang dapat dipilih/);
        expect((screen.getByText('Tambah kemasan') as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(screen.getByText('Muat ulang stok kemasan'));
        await waitFor(() => expect((screen.getByText('Tambah kemasan') as HTMLButtonElement).disabled).toBe(false));
        fireEvent.click(screen.getByText('Tambah kemasan'));
        fireEvent.click(screen.getByRole('combobox', { name: 'Kemasan 1-1' }));
        expect(await screen.findByRole('option', { name: /Sack.*pcs \/ lembar/ })).toBeTruthy();
    });
    it('uses KG decimals independently of output and clears the old amount when switching to PCS', async () => {
        vi.mocked(getProductionPackagingOptions).mockResolvedValueOnce({ success: true, data: { options: [], stock: [
            { id: 'kg', productVariantId: 'film', name: 'Film', unit: 'KG', locationId: 'stock', locationName: 'Warehouse', ownerCustomerId: null, ownerName: null, quantity: 2.5 },
            { id: 'pcs', productVariantId: 'label', name: 'Label', unit: 'PCS', locationId: 'stock', locationName: 'Warehouse', ownerCustomerId: null, ownerName: null, quantity: 10 },
        ] } });
        render(<Harness />);
        fireEvent.click(await screen.findByText('Tambah kemasan'));
        const input = screen.getByLabelText('Jumlah kemasan 1-1') as HTMLInputElement;
        expect(input.disabled).toBe(true);
        await pickMaterial(/Film/);
        expect(input.disabled).toBe(true);
        fireEvent.change(screen.getByLabelText('Gudang kemasan 1-1'), { target: { value: 'kg' } });
        expect(screen.getByText('Terpakai (KG)')).toBeTruthy();
        expect(input.step).toBe('0.0001');
        fireEvent.change(input, { target: { value: '1.25' } });
        expect(JSON.parse(screen.getByTestId('value').textContent!).groups[0]).toMatchObject({ quantity: 247, packaging: [{ unit: 'KG', quantity: 1.25 }] });
        await pickMaterial(/Label/);
        expect(input.disabled).toBe(true);
        expect(JSON.parse(screen.getByTestId('value').textContent!).groups[0].packaging[0]).toMatchObject({ sourceLocationId: '', ownerCustomerId: null, quantity: 0 });
        fireEvent.change(screen.getByLabelText('Gudang kemasan 1-1'), { target: { value: 'pcs' } });
        expect(input.value).toBe(''); expect(input.step).toBe('1');
        expect(screen.getByText('Terpakai (pcs / lembar)')).toBeTruthy();
    });
    it('deduplicates materials, hides owner prose and preserves exact warehouse ownership in the payload', async () => {
        vi.mocked(getProductionPackagingOptions).mockResolvedValueOnce({ success: true, data: { options: [], stock: [
            { id: 'own', productVariantId: 'film', name: 'Film', unit: 'KG', locationId: 'internal', locationName: 'Gudang A', ownerCustomerId: null, ownerName: null, quantity: 2.5 },
            { id: 'custody', productVariantId: 'film', name: 'Film', unit: 'KG', locationId: 'custody', locationName: 'Gudang B', ownerCustomerId: 'customer', ownerName: 'Synthetic owner', quantity: 3.4567 },
            { id: 'label', productVariantId: 'label', name: 'Label', unit: 'PCS', locationId: 'internal', locationName: 'Gudang A', ownerCustomerId: null, ownerName: null, quantity: 10 },
        ] } });
        render(<Harness />);
        fireEvent.click(await screen.findByText('Tambah kemasan'));
        fireEvent.click(screen.getByRole('combobox', { name: 'Kemasan 1-1' }));
        expect(await screen.findAllByRole('option', { name: /Film.*KG/ })).toHaveLength(1);
        expect(screen.queryByText(/Synthetic owner|Milik sendiri|Titipan/)).toBeNull();
        fireEvent.click(screen.getByRole('option', { name: /Film.*KG/ }));
        const source = screen.getByLabelText('Gudang kemasan 1-1') as HTMLSelectElement;
        expect(source.value).toBe('');
        expect([...source.options].map((option) => option.text)).toEqual(['Pilih gudang asal', 'Gudang A · 2,5 KG', 'Gudang B · 3,4567 KG']);
        fireEvent.change(source, { target: { value: 'custody' } });
        expect(JSON.parse(screen.getByTestId('value').textContent!).groups[0].packaging[0]).toMatchObject({ productVariantId: 'film', sourceLocationId: 'custody', ownerCustomerId: 'customer', unit: 'KG' });
        fireEvent.change(screen.getByLabelText('Jumlah kemasan 1-1'), { target: { value: '1' } });
        fireEvent.change(source, { target: { value: 'own' } });
        expect(JSON.parse(screen.getByTestId('value').textContent!).groups[0].packaging[0]).toMatchObject({ sourceLocationId: 'internal', ownerCustomerId: null, quantity: 0 });
    });
    it('searches a long material list and explains when there are no matches', async () => {
        vi.mocked(getProductionPackagingOptions).mockResolvedValueOnce({ success: true, data: { options: [], stock: Array.from({ length: 80 }, (_, i) => ({
            id: `stock-${i}`, productVariantId: `film-${i}`, name: `Plastik ${String(i).padStart(2, '0')}`, unit: 'KG', locationId: 'warehouse', locationName: 'Warehouse', ownerCustomerId: null, ownerName: null, quantity: 10,
        })) } });
        render(<Harness />);
        fireEvent.click(await screen.findByText('Tambah kemasan'));
        fireEvent.click(screen.getByRole('combobox', { name: 'Kemasan 1-1' }));
        const search = await screen.findByPlaceholderText('Cari nama kemasan…');
        fireEvent.change(search, { target: { value: 'Plastik 79' } });
        await waitFor(() => expect(screen.getAllByRole('option', { name: /Plastik/ })).toHaveLength(1));
        fireEvent.change(search, { target: { value: 'tidak ada' } });
        expect(await screen.findByText('Kemasan tidak ditemukan. Coba kata lain.')).toBeTruthy();
        expect(screen.queryByRole('option', { name: /Plastik/ })).toBeNull();
    });
    it('shows a retry action on load failure', async () => {
        vi.mocked(getProductionPackagingOptions).mockRejectedValueOnce(new Error('network'));
        render(<Harness />);
        await screen.findByRole('alert');
        fireEvent.click(screen.getByText('Coba lagi'));
        expect(await screen.findByText('Tambah kemasan')).toBeTruthy();
    });
    it('defaults to one group and limits addition to two', async () => {
        render(<Harness />);
        await waitFor(() => expect(screen.getByText('Tambah merek kedua')).toBeTruthy());
        fireEvent.click(screen.getByText('Tambah merek kedua'));
        expect((screen.getByText('Tambah merek kedua') as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByLabelText('Merek hasil 2')).toBeTruthy();
        fireEvent.click(screen.getByText('Hapus kelompok kedua'));
        expect(screen.queryByLabelText('Merek hasil 2')).toBeNull();
    });
});
