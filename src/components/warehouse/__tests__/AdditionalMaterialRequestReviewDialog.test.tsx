// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdditionalMaterialRequestReviewDialog } from '../AdditionalMaterialRequestReviewDialog';
import {
    confirmAdditionalMaterialRequest,
    rejectAdditionalMaterialRequest,
} from '@/actions/production/production';

vi.mock('@/actions/production/production', () => ({
    confirmAdditionalMaterialRequest: vi.fn(),
    rejectAdditionalMaterialRequest: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const locations = [
    {
        id: 'rm-1',
        name: 'Gudang Bahan Baku',
        slug: 'rm_warehouse',
        locationType: 'INTERNAL',
        locationPurpose: 'RAW_MATERIAL',
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    {
        id: 'scrap-1',
        name: 'Gudang Scrap',
        slug: 'scrap_warehouse',
        locationType: 'INTERNAL',
        locationPurpose: 'SCRAP',
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    },
] as never;

const requests = [
    {
        id: 'request-1',
        productionOrderId: 'po-1',
        quantity: 2.5,
        reason: 'Campuran terlalu kering',
        requestedAt: '2026-10-01T01:00:00.000Z',
        productVariant: {
            id: 'material-1',
            name: 'Pelembab',
            skuCode: 'RM-PLB-01',
            primaryUnit: 'KG',
            product: { productType: 'RAW_MATERIAL' },
        },
        operator: { id: 'operator-1', name: 'Operator Satu' },
    },
];

describe('AdditionalMaterialRequestReviewDialog', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(confirmAdditionalMaterialRequest).mockResolvedValue({
            success: true,
            data: { id: 'request-1', materialIssueId: 'issue-1' },
        } as never);
        vi.mocked(rejectAdditionalMaterialRequest).mockResolvedValue({
            success: true,
            data: { id: 'request-1' },
        } as never);
    });

    it('confirms the oldest pending request from the resolved material warehouse', async () => {
        render(
            <AdditionalMaterialRequestReviewDialog
                orderNumber="WO-001"
                requests={requests}
                locations={locations}
                onSuccess={vi.fn()}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /Review Bahan Tambahan/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Konfirmasi & Potong Stok' }));

        await waitFor(() =>
            expect(confirmAdditionalMaterialRequest).toHaveBeenCalledWith({
                requestId: 'request-1',
                sourceLocationId: 'rm-1',
            }),
        );
    });

    it('requires an explicit rejection reason', async () => {
        render(
            <AdditionalMaterialRequestReviewDialog
                orderNumber="WO-001"
                requests={requests}
                locations={locations}
                onSuccess={vi.fn()}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /Review Bahan Tambahan/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Tolak' }));

        expect(rejectAdditionalMaterialRequest).not.toHaveBeenCalled();
        fireEvent.change(screen.getByLabelText('Alasan penolakan'), {
            target: { value: 'Bahan tidak sesuai proses' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Tolak' }));

        await waitFor(() =>
            expect(rejectAdditionalMaterialRequest).toHaveBeenCalledWith({
                requestId: 'request-1',
                reason: 'Bahan tidak sesuai proses',
            }),
        );
    });
});
