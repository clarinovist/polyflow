// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ create: vi.fn(), success: vi.fn(), error: vi.fn(), push: vi.fn() }));
vi.mock('@/actions/sales/sales-returns', () => ({ createSalesReturnAction: mocks.create }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, back: vi.fn() }) }));
vi.mock('@/components/customers/CustomerCombobox', () => ({ CustomerCombobox: () => null }));
import { SalesReturnForm } from '../SalesReturnForm';
const id = '6ea38d39-b362-40bb-a29b-0649b1f5f182';
const initialData = { salesOrderId: id, customerId: id, returnLocationId: id, reason: 'OTHER', items: [{ productVariantId: id, returnedQty: 1, unitPrice: 100, condition: 'GOOD' as const, reason: 'OTHER' as const }] };
describe('legacy draft return result handling', () => {
    beforeEach(() => vi.clearAllMocks());
    it.each([false, true])('reports safeAction success=%s honestly', async success => {
        mocks.create.mockResolvedValue(success ? { success: true, data: { id } } : { success: false, error: 'Retur ditolak' });
        const { container } = render(<SalesReturnForm mode="create" initialData={initialData} customers={[]} products={[]} locations={[]} salesOrders={[]} />);
        expect(screen.getByText('Referensi Sales Order *')).toBeTruthy();
        fireEvent.submit(container.querySelector('form')!);
        await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
        if (success) {
            await waitFor(() => expect(mocks.success).toHaveBeenCalledWith('Draft retur dibuat; stok dan tagihan belum berubah.'));
            expect(mocks.push).toHaveBeenCalledWith('/sales/returns');
        } else {
            await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Retur ditolak'));
            expect(mocks.success).not.toHaveBeenCalled(); expect(mocks.push).not.toHaveBeenCalled();
        }
    });
});
