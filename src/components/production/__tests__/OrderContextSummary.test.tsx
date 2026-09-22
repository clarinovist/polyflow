// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrderContextSummary } from '../OrderContextSummary';
import { OrderCustomerPicker } from '../OrderCustomerPicker';
import { collectOrderCustomers, formatQualityStandard } from '@/lib/production/order-context';

afterEach(cleanup);
const a = { id: 'a', name: 'Synthetic A' };
const b = { id: 'b', name: 'Synthetic B' };
const c = { id: 'c', name: 'Synthetic C' };
const standard = { id: 'p', name: 'Berat per meter', unit: 'g/m', minValue: '11.5', maxValue: '12', targetValue: null };
describe('SPK context', () => {
    it('combines unique SO, maklon and explicit destinations', () => {
        const order = { salesOrder: { customer: a }, maklonCustomer: b, customerDestinations: [{ customer: a }, { customer: c }] };
        expect(collectOrderCustomers(order)).toEqual([a, b, c]);
        render(<OrderContextSummary order={order} standards={[standard]} />);
        expect(screen.getByText('Synthetic A, Synthetic B')).toBeTruthy();
        expect(screen.getByText('+1 customer lainnya')).toBeTruthy();
        expect(screen.getByText('Synthetic C')).toBeTruthy();
        expect(screen.getByText('Berat per meter: 11,5–12 g/m')).toBeTruthy();
        expect(screen.getByText('Standar kualitas saat ini')).toBeTruthy();
    });
    it('does not mislabel unknown customers as stock or invent standards', () => {
        render(<OrderContextSummary order={{}} />);
        expect(screen.getByText('Belum ditentukan')).toBeTruthy();
        expect(screen.queryByText('Untuk stok')).toBeNull();
        expect(screen.queryByText('Standar kualitas saat ini')).toBeNull();
    });
    it('formats partial, zero, target-only and empty standards', () => {
        expect(formatQualityStandard({ ...standard, minValue: 0, maxValue: null, targetValue: 1 })).toBe('≥ 0 g/m · Target 1 g/m');
        expect(formatQualityStandard({ ...standard, minValue: null })).toBe('≤ 12 g/m');
        expect(formatQualityStandard({ ...standard, minValue: null, maxValue: null, targetValue: 10 })).toBe('Target 10 g/m');
        expect(formatQualityStandard({ ...standard, minValue: null, maxValue: null })).toBe('Belum ada nilai acuan');
    });
    it('supports multiple selection, search and removal with labeled checkboxes', () => {
        const onChange = vi.fn();
        const view = render(<OrderCustomerPicker customers={[a, b]} value={['a']} onChange={onChange} />);
        fireEvent.click(screen.getByLabelText('Synthetic B'));
        expect(onChange).toHaveBeenLastCalledWith(['a', 'b']);
        fireEvent.click(screen.getByLabelText('Synthetic A'));
        expect(onChange).toHaveBeenLastCalledWith([]);
        fireEvent.change(screen.getByLabelText('Cari customer'), { target: { value: 'nothing' } });
        expect(screen.getByText('Customer tidak ditemukan.')).toBeTruthy();
        view.rerender(<OrderCustomerPicker customers={[a, b]} value={['a']} onChange={onChange} disabled />);
        expect((screen.getByLabelText('Cari customer') as HTMLInputElement).disabled).toBe(true);
    });
});
