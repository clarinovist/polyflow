// @vitest-environment jsdom
import type { ComponentProps } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    it('keeps actions wrapped within the responsive command header', () => {
        render(<SalesReturnDetailClient salesReturn={draft} currentUserRole="SALES" />);
        const actions = screen.getByRole('group', { name: 'Aksi retur' });
        expect(actions.className).toContain('flex-wrap');
        expect(
            within(actions).getByRole('button', { name: 'Konfirmasi Retur' }),
        ).toBeDefined();
        expect(
            actions.querySelectorAll('[data-variant="default"]'),
        ).toHaveLength(1);
        expect(
            screen.getByRole('region', { name: 'Ringkasan retur' }),
        ).toBeDefined();
        expect(
            screen.getByRole('region', { name: 'Proses Retur' }),
        ).toBeDefined();
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
    it('keeps audit behind progressive disclosure', async () => {
        render(<SalesReturnDetailClient salesReturn={draft} />);
        const audit = screen.getByRole('tab', { name: 'Audit Status' });
        expect(audit.getAttribute('aria-selected')).toBe('false');
        fireEvent.mouseDown(audit, { button: 0 });
        await waitFor(() =>
            expect(audit.getAttribute('aria-selected')).toBe('true'),
        );
    });

    it('keeps cancellation behind an explicit confirmation', async () => {
        mocks.cancel.mockResolvedValue({ success: true });
        render(<SalesReturnDetailClient salesReturn={draft} />);
        fireEvent.keyDown(screen.getByRole('button', { name: 'Lainnya' }), {
            key: 'Enter',
        });
        const menu = await screen.findByRole('menu');
        fireEvent.click(
            within(menu).getByRole('menuitem', { name: 'Batalkan Retur' }),
        );
        expect(mocks.cancel).not.toHaveBeenCalled();
        const dialog = await screen.findByRole('alertdialog');
        fireEvent.click(
            within(dialog).getByRole('button', { name: 'Batalkan Retur' }),
        );
        await waitFor(() =>
            expect(mocks.cancel).toHaveBeenCalledWith('synthetic'),
        );
    });

    it('preserves portal-aware back navigation', () => {
        render(<SalesReturnDetailClient salesReturn={draft} basePath="/alternate/returns" />);
        expect(screen.getByRole('link', { name: 'Kembali' }).getAttribute('href')).toBe('/alternate/returns');
    });
});
