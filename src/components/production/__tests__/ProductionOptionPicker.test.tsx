// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { ProductionOptionPicker } from '../ProductionOptionPicker';
vi.stubGlobal(
    'ResizeObserver',
    class {
        observe() {}
        unobserve() {}
        disconnect() {}
    },
);
Element.prototype.scrollIntoView = vi.fn();
afterEach(cleanup);
describe('production option search', () => {
    it('filters display text and returns identity, not the product name', () => {
        const onChange = vi.fn();
        render(
            <ProductionOptionPicker
                label="Produk"
                value=""
                onChange={onChange}
                options={[
                    { id: 'one', name: 'Rafia Biru' },
                    { id: 'two', name: 'Sedotan Hijau' },
                ]}
            />,
        );
        fireEvent.click(screen.getByRole('combobox', { name: 'Produk' }));
        fireEvent.change(screen.getByLabelText('Cari produk'), {
            target: { value: 'Hijau' },
        });
        expect(screen.queryByRole('option', { name: /Rafia/ })).toBeNull();
        fireEvent.click(screen.getByRole('option', { name: /Sedotan/ }));
        expect(onChange).toHaveBeenCalledWith('two');
        expect(
            screen
                .getByRole('combobox', { name: 'Produk' })
                .getAttribute('aria-expanded'),
        ).toBe('false');
    });
    it('keeps duplicate display names separate and exposes empty search state', () => {
        render(
            <ProductionOptionPicker
                label="Resep"
                value="one"
                onChange={vi.fn()}
                options={[
                    { id: 'one', name: 'Standar', description: '100 KG' },
                    { id: 'two', name: 'Standar', description: '200 KG' },
                ]}
            />,
        );
        fireEvent.click(screen.getByRole('combobox', { name: 'Resep' }));
        expect(screen.getAllByRole('option')).toHaveLength(2);
        fireEvent.change(screen.getByLabelText('Cari resep'), {
            target: { value: 'absent' },
        });
        expect(screen.getByText('Tidak ada pilihan yang cocok.')).toBeTruthy();
    });
});
