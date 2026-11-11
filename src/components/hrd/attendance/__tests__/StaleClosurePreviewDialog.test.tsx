// @vitest-environment jsdom

import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { StaleClosurePreviewDialog } from '../StaleClosurePreviewDialog';
import type { ClosurePhase } from '../useStaleClosure';
import { APPLY_RESULT, PREVIEW } from './closureFixtures';

function setup(phase: ClosurePhase) {
    const onClose = vi.fn();
    const onApply = vi.fn();
    const onRetry = vi.fn();
    const view = render(
        <StaleClosurePreviewDialog
            phase={phase}
            onClose={onClose}
            onApply={onApply}
            onRetry={onRetry}
        />,
    );
    return { onClose, onApply, onRetry, ...view };
}

const ready = (extra: Partial<Extract<ClosurePhase, { status: 'ready' }>> = {}): ClosurePhase => ({
    status: 'ready',
    preview: PREVIEW,
    applyError: null,
    isOutdated: false,
    ...extra,
});

const applyBtn = () => screen.getByRole('button', { name: /Terapkan koreksi|Memproses/ });
const confirmBox = () => screen.getByRole('checkbox', { name: /Saya mengerti koreksi ini mengubah upah karyawan/ });

describe('StaleClosurePreviewDialog', () => {
    it('renders nothing while idle', () => {
        setup({ status: 'idle' });

        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('shows a loading status while the preview is built', () => {
        setup({ status: 'loading' });

        expect(screen.getByRole('status').textContent).toMatch(/Membuat pratinjau/);
    });

    it('shows an error with retry (not an empty preview) when loading failed', () => {
        const { onRetry } = setup({ status: 'error', message: 'Ditolak server' });

        expect(screen.getByRole('alert').textContent).toContain('Ditolak server');
        expect(screen.queryByRole('table')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('lets the user close the dialog from the error state', () => {
        const { onClose } = setup({ status: 'error', message: 'x' });

        fireEvent.click(screen.getByRole('button', { name: 'Tutup' }));

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('summarises eligible, ineligible and total earnings above the table', () => {
        setup(ready());

        const summary = screen.getByRole('region', { name: 'Ringkasan pratinjau' });
        expect(within(summary).getByText(/2 layak/)).toBeTruthy();
        expect(within(summary).getByText(/1 tidak layak/)).toBeTruthy();
        expect(within(summary).getByText(/250\.000/)).toBeTruthy();
        expect(within(summary).getByText(/Akhir shift terjadwal/)).toBeTruthy();
    });

    it('lists each row with clock-in, proposed clock-out, hours and wage', () => {
        setup(ready());

        const row = within(screen.getByRole('table')).getByText('Siti Contoh').closest('tr') as HTMLElement;
        expect(within(row).getByText('E002')).toBeTruthy();
        expect(within(row).getByText(/3 Nov 2026/)).toBeTruthy();
        expect(within(row).getByText(/20\.00/)).toBeTruthy(); // masuk 20:00 WIB
        expect(within(row).getByText(/4 Nov, 08\.00/)).toBeTruthy(); // pulang usulan
        expect(within(row).getByText(/Lembur 4 jam/)).toBeTruthy();
        expect(within(row).getByText(/150\.000/)).toBeTruthy();
        expect(within(row).getByText('Layak')).toBeTruthy();
        expect(within(row).getByText(/Tarif harian 0/)).toBeTruthy();
    });

    it('marks ineligible rows with their reason and no wage', () => {
        setup(ready());

        const row = screen.getByText('Dewi Contoh').closest('tr') as HTMLElement;
        expect(within(row).getByText('Tidak layak')).toBeTruthy();
        expect(within(row).getByText(/Jam masuk melewati akhir shift/)).toBeTruthy();
        expect(within(row).queryByText(/Rp/)).toBeNull();
    });

    it('shows subtotals per employee and per week with the underpayment note', () => {
        setup(ready());

        const employees = screen.getByRole('region', { name: 'Subtotal per karyawan' });
        expect(within(employees).getByText('Budi Contoh')).toBeTruthy();
        expect(within(employees).getByText(/100\.000/)).toBeTruthy();
        const weeks = screen.getByRole('region', { name: 'Subtotal per minggu' });
        expect(within(weeks).getByText(/2 Nov 2026/)).toBeTruthy();
        expect(within(weeks).getByText(/9 Nov 2026/)).toBeTruthy();
        expect(weeks.textContent).toMatch(/KEKURANGAN UPAH/);
        expect(weeks.textContent).toMatch(/sudah dibayar/);
    });

    it('keeps Terapkan koreksi disabled until the confirmation is ticked', () => {
        setup(ready());

        expect((applyBtn() as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(confirmBox());
        expect((applyBtn() as HTMLButtonElement).disabled).toBe(false);
        fireEvent.click(confirmBox());
        expect((applyBtn() as HTMLButtonElement).disabled).toBe(true);
    });

    it('applies once the confirmation is ticked', () => {
        const { onApply } = setup(ready());

        fireEvent.click(confirmBox());
        fireEvent.click(applyBtn());

        expect(onApply).toHaveBeenCalledTimes(1);
    });

    it('does not offer to apply when no row is eligible', () => {
        setup(
            ready({
                preview: {
                    ...PREVIEW,
                    totals: { eligibleCount: 0, ineligibleCount: 3, earnings: 0 },
                },
            }),
        );

        fireEvent.click(confirmBox());

        expect((applyBtn() as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByText(/Tidak ada sesi yang layak ditutup/)).toBeTruthy();
    });

    it('locks everything while applying and cannot be closed', () => {
        const { onClose } = setup({ status: 'applying', preview: PREVIEW });

        expect((applyBtn() as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByRole('button', { name: 'Batal' }) as HTMLButtonElement).disabled).toBe(true);
        expect(applyBtn().textContent).toMatch(/Memproses/);
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        expect(onClose).not.toHaveBeenCalled();
    });

    it('closes on Escape or Batal when not busy', () => {
        const { onClose } = setup(ready());

        fireEvent.click(screen.getByRole('button', { name: 'Batal' }));
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

        expect(onClose).toHaveBeenCalledTimes(2);
    });

    it('shows a plain server error and keeps the apply controls', () => {
        setup(ready({ applyError: 'Tidak berwenang' }));

        expect(screen.getByRole('alert').textContent).toContain('Tidak berwenang');
        expect(screen.queryByRole('button', { name: 'Buat pratinjau ulang' })).toBeNull();
    });

    it('offers to rebuild the preview when the data changed, and blocks applying', () => {
        const { onRetry } = setup(
            ready({
                applyError: 'Data berubah sejak pratinjau, buat pratinjau ulang',
                isOutdated: true,
            }),
        );

        expect(screen.getByRole('alert').textContent).toContain('Data berubah sejak pratinjau');
        expect((applyBtn() as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: 'Buat pratinjau ulang' }));
        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('shows the result summary after success and closes via Selesai', () => {
        const { onClose } = setup({ status: 'done', preview: PREVIEW, result: APPLY_RESULT });

        const dialog = screen.getByRole('dialog');
        expect(within(dialog).getByText(/2 sesi ditutup/)).toBeTruthy();
        expect(within(dialog).getByText(/250\.000/)).toBeTruthy();
        expect(screen.queryByRole('table')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Selesai' }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('mentions rows that were skipped at apply time', () => {
        setup({
            status: 'done',
            preview: PREVIEW,
            result: { ...APPLY_RESULT, skippedCount: 1 },
        });

        expect(screen.getByText(/1 sesi dilewati/)).toBeTruthy();
    });
});
