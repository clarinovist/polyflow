// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import Page from '../page';
vi.mock('@/actions/production/machines', () => ({ getMachineHistory: async () => ({ success: true, data: { machine: { code: 'MC-01', name: 'Mesin A', status: 'ACTIVE' }, executions: [
    { id: 'e1', status: 'COMPLETED', quantityProduced: 100, startTime: new Date(), endTime: new Date(), productionOrder: { orderNumber: 'SPK-01', bom: { productVariant: { name: 'Produk A', primaryUnit: 'KG' } }, shifts: [] } },
    { id: 'e2', status: 'COMPLETED', quantityProduced: 20, startTime: new Date(), endTime: new Date(), productionOrder: { orderNumber: 'SPK-02', bom: { productVariant: { name: 'Produk B', primaryUnit: 'PCS' } }, shifts: [] } },
] } }) }));
afterEach(cleanup);
describe('machine history mixed units', () => {
    it('does not sum kilograms and pieces into a kilogram total', async () => {
        render(await Page({ params: Promise.resolve({ id: 'machine' }) }));
        expect(screen.getByText('100 KG · 20 PCS')).toBeTruthy();
        expect(screen.getByText('Total Hasil per Satuan')).toBeTruthy();
        expect(screen.queryByText('120')).toBeNull();
    });
});
