// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MobileOpnameDetailClient } from '../MobileOpnameDetailClient';
import { addOpnameEntry } from '@/actions/inventory/opname';

const { refresh, toastError } = vi.hoisted(() => ({
    refresh: vi.fn(),
    toastError: vi.fn(),
}));
const mutationId = '11111111-1111-4111-8111-111111111111';

vi.mock('next/navigation', () => ({
    useRouter: () => ({ refresh }),
}));

vi.mock('sonner', () => ({
    toast: {
        error: toastError,
        success: vi.fn(),
    },
}));

vi.mock('@/actions/inventory/opname', () => ({
    addItemToOpname: vi.fn(),
    addOpnameEntry: vi.fn(),
    completeOpname: vi.fn(),
    deleteOpnameEntry: vi.fn(),
    saveOpnameCount: vi.fn(),
}));

vi.mock('@/actions/production/boms', () => ({
    getProductVariants: vi.fn(),
}));

vi.mock('@/components/warehouse/WarehouseAttachmentPanel', () => ({
    WarehouseAttachmentPanel: () => null,
}));

vi.mock(
    '@/components/warehouse/inventory/opname/FinalizeOpnameDialog',
    () => ({ FinalizeOpnameDialog: () => null }),
);

const session = {
    id: 'opname-1',
    status: 'OPEN',
    remarks: null,
    location: { name: 'Gudang' },
    createdBy: { name: 'Putri' },
    items: [
        {
            id: 'item-1',
            systemQuantity: 100,
            countedQuantity: null,
            notes: null,
            productVariant: {
                name: 'Produk KG',
                skuCode: 'SKU-KG',
                primaryUnit: 'KG',
                product: { name: 'Produk' },
            },
            entries: [],
        },
    ],
    opnameNumber: 'OPN-TEST',
    effectiveDate: null,
};

beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    vi.stubGlobal('crypto', {
        ...globalThis.crypto,
        randomUUID: vi.fn(() => mutationId),
    });
});

describe('MobileOpnameDetailClient entry synchronization', () => {
    it('memakai mutation ID yang sama saat retry dan memblokir finalisasi selama gagal', async () => {
        vi.mocked(addOpnameEntry)
            .mockResolvedValueOnce({
                success: false,
                error: 'Koneksi terputus',
                code: 'INTERNAL_ERROR',
            })
            .mockResolvedValueOnce({
                success: true,
                data: {
                    id: 'entry-server',
                    quantity: 58,
                    label: null,
                    createdAt: new Date('2026-10-13T03:00:00Z'),
                    countedQuantity: 58,
                    entryCount: 1,
                },
            });

        render(
            <MobileOpnameDetailClient
                session={session}
                currentUserId="user-1"
            />,
        );

        fireEvent.change(screen.getByTestId('entry-input'), {
            target: { value: '58' },
        });
        fireEvent.click(screen.getByTestId('add-button'));

        await waitFor(() =>
            expect(screen.getByRole('alert').textContent).toContain(
                'Koneksi terputus',
            ),
        );
        expect(addOpnameEntry).toHaveBeenNthCalledWith(
            1,
            'item-1',
            58,
            mutationId,
            undefined,
        );
        expect(
            screen.getByText('1 rincian belum tersinkron'),
        ).toBeTruthy();
        expect(
            (screen.getByRole('button', {
                name: 'Selesai',
            }) as HTMLButtonElement).disabled,
        ).toBe(true);

        fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));

        await waitFor(() =>
            expect(addOpnameEntry).toHaveBeenNthCalledWith(
                2,
                'item-1',
                58,
                mutationId,
                undefined,
            ),
        );
        await waitFor(() =>
            expect(
                screen.queryByText('1 rincian belum tersinkron'),
            ).toBeNull(),
        );
        expect(
            (screen.getByRole('button', {
                name: 'Selesai',
            }) as HTMLButtonElement).disabled,
        ).toBe(false);
        expect(
            sessionStorage.getItem(
                'polyflow:opname-entry-drafts:v1:user-1:opname-1',
            ),
        ).toBeNull();
    });

    it('memulihkan rincian gagal setelah reload dan mempertahankan mutation ID', async () => {
        sessionStorage.setItem(
            'polyflow:opname-entry-drafts:v1:user-1:opname-1',
            JSON.stringify({
                'item-1': [
                    {
                        id: mutationId,
                        quantity: 58,
                        label: null,
                        status: 'failed',
                        error: 'Koneksi terputus',
                    },
                ],
            }),
        );
        vi.mocked(addOpnameEntry).mockResolvedValue({
            success: true,
            data: {
                id: 'entry-server',
                quantity: 58,
                label: null,
                createdAt: new Date('2026-10-13T03:00:00Z'),
                countedQuantity: 58,
                entryCount: 1,
            },
        });

        render(
            <MobileOpnameDetailClient
                session={session}
                currentUserId="user-1"
            />,
        );

        await waitFor(() =>
            expect(screen.getByRole('button', { name: 'Coba lagi' })).toBeTruthy(),
        );
        expect(
            (screen.getByRole('button', {
                name: 'Selesai',
            }) as HTMLButtonElement).disabled,
        ).toBe(true);

        fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));

        await waitFor(() =>
            expect(addOpnameEntry).toHaveBeenCalledWith(
                'item-1',
                58,
                mutationId,
                undefined,
            ),
        );
    });
});
