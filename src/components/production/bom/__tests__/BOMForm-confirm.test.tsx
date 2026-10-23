// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BOMForm } from '../BOMForm';
import { evaluateBomMassBalance } from '@/lib/production/bom-form-validation';
const mocks = vi.hoisted(() => ({ update: vi.fn(), push: vi.fn(), error: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, back: vi.fn() }), usePathname: () => '/production/boms/test/edit' }));
vi.mock('@/actions/production/boms', () => ({ updateBom: mocks.update, createBom: mocks.update }));
vi.mock('@/components/products/product-combobox', () => ({ ProductCombobox: () => <span>Pemilih produk</span> }));
vi.mock('@/lib/production/bom-form-validation', () => ({ evaluateBomMassBalance: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: mocks.error } }));
const output = '11111111-1111-4111-8111-111111111111';
const material = '22222222-2222-4222-8222-222222222222';
const bom = { id: 'bom-test', name: 'Formula A', productVariantId: output, outputQuantity: 100, isDefault: false, category: 'STANDARD', items: [{ productVariantId: material, quantity: 100, scrapPercentage: 0 }] } as never;
const variants = [{ id: output, name: 'Produk A', skuCode: 'PA', primaryUnit: 'KG' }, { id: material, name: 'Bahan A', skuCode: 'BA', primaryUnit: 'KG' }] as never;
beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); mocks.update.mockResolvedValue({ success: false, error: 'Validasi server' }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('BOM warnings use application confirmation without changing submission', () => {
    it.each(['output-exceeds-input', 'high-shrinkage'])('requires confirmation for %s', async (status) => {
        vi.mocked(evaluateBomMassBalance).mockReturnValue({ status, totalInputKg: 100, outputKg: 100, shrinkagePercent: 80 } as never);
        const { container } = render(<BOMForm bom={bom} productVariants={variants} />);
        fireEvent.submit(container.querySelector('form')!);
        await screen.findByRole('alertdialog');
        expect(mocks.update).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Batal' }));
        expect(mocks.update).not.toHaveBeenCalled();
        fireEvent.submit(container.querySelector('form')!);
        await screen.findByRole('alertdialog');
        fireEvent.click(screen.getByRole('button', { name: 'Lanjutkan' }));
        await waitFor(() => expect(mocks.update).toHaveBeenCalledWith('bom-test', expect.objectContaining({ outputQuantity: 100, items: [{ productVariantId: material, quantity: 100, scrapPercentage: 0 }] })));
        expect(mocks.error).toHaveBeenCalledWith('Validasi server');
    });
    it('submits a valid balance without a warning', async () => {
        vi.mocked(evaluateBomMassBalance).mockReturnValue({ status: 'balanced' } as never);
        const { container } = render(<BOMForm bom={bom} productVariants={variants} />);
        fireEvent.submit(container.querySelector('form')!);
        await waitFor(() => expect(mocks.update).toHaveBeenCalledOnce());
        expect(screen.queryByRole('alertdialog')).toBeNull();
    });
});
