// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdditionalMaterialRequestDialog } from '../AdditionalMaterialRequestDialog';
import { requestAdditionalMaterial } from '@/actions/production/production';

vi.mock('@/actions/production/production', () => ({
    requestAdditionalMaterial: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const material = {
    id: 'material-1',
    name: 'Pelembab',
    skuCode: 'RM-PLB-01',
    primaryUnit: 'KG',
    product: { productType: 'RAW_MATERIAL' },
};

describe('AdditionalMaterialRequestDialog', () => {
    beforeAll(() => {
        vi.stubGlobal(
            'ResizeObserver',
            class ResizeObserver {
                observe() {}
                unobserve() {}
                disconnect() {}
            },
        );
        Element.prototype.scrollIntoView = vi.fn();
    });

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requestAdditionalMaterial).mockResolvedValue({
            success: true,
            data: { id: 'request-1', status: 'PENDING', idempotent: false },
        } as never);
    });

    it('submits only a pending request with SPK and operator attribution', async () => {
        render(
            <AdditionalMaterialRequestDialog
                productionOrderId="po-1"
                orderNumber="WO-001"
                operatorId="operator-1"
                materials={[material]}
                open
            />,
        );

        fireEvent.click(screen.getByRole('combobox', { name: 'Bahan' }));
        fireEvent.click(await screen.findByText('Pelembab'));
        fireEvent.change(screen.getByLabelText('Jumlah (KG)'), {
            target: { value: '2.5' },
        });
        fireEvent.change(screen.getByLabelText('Alasan'), {
            target: { value: 'Campuran terlalu kering' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Kirim ke Gudang' }));
        fireEvent.click(screen.getByRole('button', { name: 'Kirim ke Gudang' }));

        await waitFor(() =>
            expect(requestAdditionalMaterial).toHaveBeenCalledWith(
                expect.objectContaining({
                    productionOrderId: 'po-1',
                    productVariantId: 'material-1',
                    quantity: 2.5,
                    reason: 'Campuran terlalu kering',
                    operatorId: 'operator-1',
                    clientRequestId: expect.any(String),
                }),
            ),
        );
        expect(requestAdditionalMaterial).toHaveBeenCalledTimes(1);
    });

    it('keeps warehouse confirmation language visible', () => {
        render(
            <AdditionalMaterialRequestDialog
                productionOrderId="po-1"
                orderNumber="WO-001"
                operatorId="operator-1"
                materials={[material]}
                open
            />,
        );

        expect(
            screen.getByText(/stok dan HPP baru berubah setelah gudang mengonfirmasi/i),
        ).toBeTruthy();
    });
});
