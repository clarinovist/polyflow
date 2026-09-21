// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DailyProductionDashboard, type Order } from '../DailyProductionDashboard';
vi.mock('../QuickProduceDialog', () => ({ QuickProduceDialog: ({ open }: { open: boolean }) => open ? <div>Quick SPK dialog</div> : null }));
afterEach(cleanup);
const orders: Order[] = ['IN_PROGRESS', 'RELEASED'].map((status, index) => ({ id: `order-${index}`, orderNumber: `TEST-${index}`, status, plannedQuantity: 100, actualQuantity: 20, plannedStartDate: '2026-09-21', notes: null, bom: { id: 'bom-test', name: 'Test recipe', category: 'EXTRUSION', productVariant: { id: 'variant-test', name: `Test product ${index}`, primaryUnit: 'KG' } }, machine: null, executions: [], plannedMaterials: [] }));

describe('SPK process board', () => {
    it('keeps empty processes compact on mobile and retains work and status filtering', () => {
        render(<DailyProductionDashboard orders={orders} boms={[]} machines={[]} />);
        const mixing = screen.getByRole('region', { name: 'MIXING' });
        expect(mixing.className.split(' ')).not.toContain('min-h-[320px]');
        expect(mixing.className).toContain('md:min-h-[320px]');
        expect(within(mixing).getByText('Tidak ada SPK di proses ini').className.split(' ')).toContain('py-3');
        expect(screen.getAllByRole('link', { name: 'Detail' })).toHaveLength(2);
        fireEvent.click(screen.getByRole('button', { name: 'Sedang Jalan' }));
        expect(screen.getAllByRole('link', { name: 'Detail' })).toHaveLength(1);
        fireEvent.click(screen.getByRole('button', { name: 'Buat SPK Cepat' }));
        expect(screen.getByText('Quick SPK dialog')).toBeTruthy();
    });
    it('names the empty-state entry point as SPK, not adding a master product', () => {
        render(<DailyProductionDashboard orders={[]} boms={[]} machines={[]} />);
        expect(screen.queryByText('Tambah Produk')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Buat SPK Cepat Pertama' }));
        expect(screen.getByText('Quick SPK dialog')).toBeTruthy();
    });
});
