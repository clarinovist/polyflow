// @vitest-environment jsdom
import type { ComponentProps } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ confirm: vi.fn(), complete: vi.fn(), cancel: vi.fn(), refresh: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock('@/actions/sales/sales-returns', () => ({ confirmSalesReturnAction: mocks.confirm, completeSalesReturnAction: mocks.complete, cancelSalesReturnAction: mocks.cancel }));
vi.mock('@/components/shared/EntityStatusTimeline', () => ({ EntityStatusTimeline: () => null }));
vi.mock('../ReturnReceiveDialog', () => ({ ReturnReceiveDialog: () => <button>Terima Item</button> }));
import { SalesReturnDetailClient } from '../SalesReturnDetailClient';
type ReturnDetail = ComponentProps<typeof SalesReturnDetailClient>['salesReturn'];
const draft = { id: 'synthetic', returnNumber: 'SR-TEST', status: 'DRAFT', returnDate: new Date('2026-09-19'), totalAmount: 0, items: [] } as unknown as ReturnDetail;

describe('Sales return operational controls', () => {
    beforeEach(() => { vi.clearAllMocks(); mocks.confirm.mockResolvedValue({ success: true }); });
    it('keeps actions wrapped within the mobile detail header', () => {
        render(<SalesReturnDetailClient salesReturn={draft} currentUserRole="SALES" />);
        expect(screen.getByRole('button', { name: 'Konfirmasi Retur' }).parentElement?.className).toContain('flex-wrap');
        expect(screen.getByRole('button', { name: 'Konfirmasi Retur' }).parentElement?.parentElement?.className).toContain('flex-wrap');
    });
    it('confirms Draft through the existing action then refreshes', async () => {
        render(<SalesReturnDetailClient salesReturn={draft} currentUserRole="SALES" />);
        fireEvent.click(screen.getByRole('button', { name: 'Konfirmasi Retur' }));
        await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
        expect(mocks.confirm).toHaveBeenCalledWith('synthetic');
        expect(mocks.success).toHaveBeenCalledOnce();
    });
    it('shows safeAction failure without success or refresh', async () => {
        mocks.confirm.mockResolvedValue({ success: false, error: 'Unauthorized synthetic action' });
        render(<SalesReturnDetailClient salesReturn={draft} />);
        fireEvent.click(screen.getByRole('button', { name: 'Konfirmasi Retur' }));
        await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Unauthorized synthetic action'));
        expect(mocks.success).not.toHaveBeenCalled();
        expect(mocks.refresh).not.toHaveBeenCalled();
    });
    it('shows a thrown action failure honestly', async () => {
        mocks.confirm.mockRejectedValue(new Error('network'));
        render(<SalesReturnDetailClient salesReturn={draft} />);
        fireEvent.click(screen.getByRole('button', { name: 'Konfirmasi Retur' }));
        await waitFor(() => expect(mocks.error).toHaveBeenCalled());
        expect(mocks.success).not.toHaveBeenCalled();
        expect(mocks.refresh).not.toHaveBeenCalled();
    });
    it.each(['DRAFT', 'CONFIRMED', 'RECEIVED', 'COMPLETED', 'CANCELLED'] as const)('preserves %s status-dependent controls', (status) => {
        render(<SalesReturnDetailClient salesReturn={{ ...draft, status }} />);
        expect(!!screen.queryByRole('button', { name: 'Konfirmasi Retur' })).toBe(status === 'DRAFT');
        expect(!!screen.queryByRole('button', { name: 'Terima Item' })).toBe(status === 'CONFIRMED');
        expect(!!screen.queryByRole('button', { name: 'Selesaikan Retur' })).toBe(status === 'RECEIVED');
    });
    it('preserves portal-aware back navigation', () => {
        render(<SalesReturnDetailClient salesReturn={draft} basePath="/alternate/returns" />);
        expect(screen.getByRole('link', { name: 'Kembali' }).getAttribute('href')).toBe('/alternate/returns');
    });
});
