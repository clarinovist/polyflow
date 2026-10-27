// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FinalizeOpnameDialog } from '../FinalizeOpnameDialog';
import { previewOpnameFinalization } from '@/actions/inventory/opname';
import { toBusinessDateString } from '@/lib/utils/timezone';
import type { OpnameFinalizationPreview } from '@/services/inventory/stock-opname-service';

vi.mock('@/actions/inventory/opname', () => ({
    previewOpnameFinalization: vi.fn(),
}));

function preview(
    overrides: Partial<OpnameFinalizationPreview> = {},
): OpnameFinalizationPreview {
    return {
        opnameId: 'opname-1',
        opnameNumber: 'OPN-TEST',
        status: 'OPEN',
        effectiveDate: '2026-09-30',
        effectiveAt: '2026-09-30T16:59:59.999Z',
        itemCount: 2,
        countedCount: 2,
        uncountedCount: 0,
        varianceCount: 1,
        gainValue: '1000.00',
        lossValue: '0.00',
        netValue: '1000.00',
        blockers: [],
        warnings: [],
        canFinalize: true,
        requiresAcknowledgement: false,
        outlierItems: [],
        ...overrides,
    };
}

function confirmButton(): HTMLButtonElement {
    return screen.getByRole('button', {
        name: 'Finalisasi',
    }) as HTMLButtonElement;
}

beforeEach(() => {
    vi.mocked(previewOpnameFinalization).mockResolvedValue({
        success: true,
        data: preview(),
    });
});

afterEach(() => vi.useRealTimers());

describe('FinalizeOpnameDialog', () => {
    it('keeps a finalization failure visible alongside the unchanged effective date', async () => {
        render(<FinalizeOpnameDialog open onOpenChange={vi.fn()} onConfirm={vi.fn()} isSubmitting={false} opnameId="opname-1" failure={{ title: 'Opname belum difinalisasi', message: 'Minta Finance memeriksa biaya barang.' }} />);
        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toContain('Opname belum difinalisasi');
        expect(screen.getByLabelText('Tanggal Efektif')).toBeTruthy();
        await waitFor(() => expect(confirmButton().disabled).toBe(false));
    });

    it('defaults to today, warns about uncounted items, and submits the selected date', async () => {
        const onConfirm = vi.fn();

        render(
            <FinalizeOpnameDialog
                open
                onOpenChange={vi.fn()}
                onConfirm={onConfirm}
                isSubmitting={false}
                uncountedItems={2}
                opnameId="opname-1"
            />,
        );

        const input = screen.getByLabelText(
            'Tanggal Efektif',
        ) as HTMLInputElement;
        const today = toBusinessDateString(new Date());
        expect(input.value).toBe(today);
        expect(input.max).toBe(today);
        expect(screen.getByRole('alert').textContent).toContain(
            '2 item belum dihitung',
        );

        await waitFor(() => expect(confirmButton().disabled).toBe(false));

        fireEvent.change(input, { target: { value: '2026-09-30' } });

        await waitFor(() =>
            expect(previewOpnameFinalization).toHaveBeenLastCalledWith(
                'opname-1',
                '2026-09-30',
            ),
        );
        await waitFor(() => expect(confirmButton().disabled).toBe(false));

        fireEvent.click(confirmButton());

        expect(onConfirm).toHaveBeenCalledExactlyOnceWith('2026-09-30');
    });

    it('does not allow dismissal or duplicate submission while pending', () => {
        const onOpenChange = vi.fn();
        const onConfirm = vi.fn();

        render(
            <FinalizeOpnameDialog
                open
                onOpenChange={onOpenChange}
                onConfirm={onConfirm}
                isSubmitting
                opnameId="opname-1"
            />,
        );

        expect(confirmButton().disabled).toBe(true);
        expect(
            (screen.getByRole('button', { name: 'Batal' }) as HTMLButtonElement)
                .disabled,
        ).toBe(true);

        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        expect(onOpenChange).not.toHaveBeenCalledWith(false);
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it('names the blocking items and refuses to finalize', async () => {
        vi.mocked(previewOpnameFinalization).mockResolvedValue({
            success: true,
            data: preview({
                canFinalize: false,
                blockers: [
                    {
                        code: 'OPNAME_NEGATIVE_LIVE_STOCK',
                        message:
                            'Finalisasi akan membuat stok berjalan negatif. Periksa hasil hitung dan mutasi setelah tanggal efektif.',
                        items: [
                            {
                                skuCode: 'SKU-NEG',
                                name: 'Barang Negatif',
                                detail: 'hitung 0 vs saldo cutoff 17 → proyeksi -17',
                            },
                        ],
                    },
                ],
            }),
        });
        const onConfirm = vi.fn();

        render(
            <FinalizeOpnameDialog
                open
                onOpenChange={vi.fn()}
                onConfirm={onConfirm}
                isSubmitting={false}
                opnameId="opname-1"
            />,
        );

        await waitFor(() =>
            expect(screen.getByText('Finalisasi diblokir')).toBeDefined(),
        );
        expect(screen.getByText('SKU-NEG')).toBeDefined();
        expect(
            screen.getByText(/proyeksi -17/),
        ).toBeDefined();
        expect(confirmButton().disabled).toBe(true);

        fireEvent.click(confirmButton());
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it('requires explicit acknowledgement for a count taken before later movements', async () => {
        vi.mocked(previewOpnameFinalization).mockResolvedValue({
            success: true,
            data: preview({
                requiresAcknowledgement: true,
                warnings: [
                    {
                        code: 'OPNAME_COUNT_BEFORE_MOVEMENT',
                        message:
                            'Ada mutasi stok pada tanggal efektif setelah penghitungan terakhir. Pindah tanggal efektif atau hitung ulang item berikut.',
                        items: [
                            {
                                skuCode: 'SKU-STALE',
                                name: 'Barang Telat Hitung',
                                detail:
                                    'keluar 2350 setelah penghitungan (SJ-1, 13 Okt 2026 07.00)',
                            },
                        ],
                    },
                ],
            }),
        });
        const onConfirm = vi.fn();

        render(
            <FinalizeOpnameDialog
                open
                onOpenChange={vi.fn()}
                onConfirm={onConfirm}
                isSubmitting={false}
                opnameId="opname-1"
            />,
        );

        const checkbox = await screen.findByRole('checkbox');
        expect(checkbox).toHaveProperty('checked', false);

        await waitFor(() => expect(confirmButton().disabled).toBe(true));
        fireEvent.click(confirmButton());
        expect(onConfirm).not.toHaveBeenCalled();

        fireEvent.click(checkbox);
        await waitFor(() => expect(confirmButton().disabled).toBe(false));

        fireEvent.click(confirmButton());
        expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('surfaces a preview failure instead of enabling finalization', async () => {
        vi.mocked(previewOpnameFinalization).mockResolvedValue({
            success: false,
            error: 'Stok opname tidak ditemukan',
            code: 'NOT_FOUND',
        });

        render(
            <FinalizeOpnameDialog
                open
                onOpenChange={vi.fn()}
                onConfirm={vi.fn()}
                isSubmitting={false}
                opnameId="opname-1"
            />,
        );

        await waitFor(() =>
            expect(screen.getByText('Pratinjau tidak dapat dimuat')).toBeDefined(),
        );
        expect(screen.getByText('Stok opname tidak ditemukan')).toBeDefined();
        expect(confirmButton().disabled).toBe(true);
    });
});
