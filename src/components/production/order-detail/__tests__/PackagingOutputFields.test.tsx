// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { PackagingOutputFields } from '../PackagingOutputFields';
import type { PackagedOutputValues } from '@/lib/schemas/production-packaging';
vi.mock('@/actions/production/packaging', () => ({ getProductionPackagingOptions: vi.fn(async () => ({ success: true, data: {
    options: [{ id: 'a', name: 'Brand A', labelVariantId: null }, { id: 'b', name: 'Brand B', labelVariantId: null }],
    stock: [{ id: 'stock', productVariantId: 'sack', name: 'Sack', locationId: 'location', locationName: 'Warehouse', ownerCustomerId: 'customer', ownerName: 'Synthetic owner', quantity: 100 }],
} })) }));
function Harness() {
    const [value, setValue] = useState<PackagedOutputValues>({ clientRequestId: 'ce26b37c-85c5-46cb-bc5c-5ec212db2da4', groups: [{ productVariantId: 'a', quantity: 247, packaging: [] }] });
    return <><PackagingOutputFields baseVariantId="base" baseName="Base" unit="KG" value={value} onChange={setValue} /><output data-testid="value">{JSON.stringify(value)}</output></>;
}
afterEach(cleanup);
describe('PackagingOutputFields', () => {
    it('keeps actual KG independent of selected sack count and preserves source owner', async () => {
        render(<Harness />);
        await waitFor(() => expect(screen.getByText('Tambah kemasan')).toBeTruthy());
        fireEvent.click(screen.getByText('Tambah kemasan'));
        fireEvent.change(screen.getByLabelText('Kemasan 1-1'), { target: { value: 'stock' } });
        fireEvent.change(screen.getByLabelText('Jumlah kemasan 1-1'), { target: { value: '10' } });
        const value = JSON.parse(screen.getByTestId('value').textContent!);
        expect(value.groups[0]).toMatchObject({ quantity: 247, packaging: [{ quantity: 10, ownerCustomerId: 'customer', sourceLocationId: 'location' }] });
        fireEvent.change(screen.getByLabelText('Jumlah hasil kelompok 1'), { target: { value: '249.5' } });
        expect(JSON.parse(screen.getByTestId('value').textContent!).groups[0].packaging[0].quantity).toBe(10);
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
