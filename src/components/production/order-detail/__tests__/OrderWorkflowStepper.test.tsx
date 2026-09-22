// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OrderWorkflowStepper } from '../OrderWorkflowStepper';

describe('compact SPK lifecycle', () => {
    it.each([
        ['DRAFT', 'Draft'],
        ['WAITING_MATERIAL', 'Menunggu Bahan'],
        ['RELEASED', 'Siap Produksi'],
        ['IN_PROGRESS', 'Sedang Diproduksi'],
        ['COMPLETED', 'Produksi Selesai'],
    ])('marks only the current status for %s', (status, label) => {
        const { container } = render(<OrderWorkflowStepper status={status} />);
        const current = container.querySelectorAll('[aria-current="step"]');
        expect(current).toHaveLength(1);
        expect(current[0].textContent).toBe(label);
        if (status === 'IN_PROGRESS')
            expect(
                screen
                    .getByText('Produksi Selesai')
                    .getAttribute('aria-current'),
            ).toBeNull();
    });
    it('shows cancellation without suggesting the order completed', () => {
        const { container } = render(
            <OrderWorkflowStepper status="CANCELLED" />,
        );
        expect(screen.getByText('SPK Dibatalkan')).toBeTruthy();
        expect(container.querySelector('[aria-current]')).toBeNull();
    });
    it('points waiting orders to the actual material tab rather than a nonexistent tab', () => {
        render(<OrderWorkflowStepper status="WAITING_MATERIAL" />);
        expect(screen.getByText(/tab Bahan, tim & kualitas/)).toBeTruthy();
    });
});
