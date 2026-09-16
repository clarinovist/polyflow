// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ReportFilters } from '../ReportFilters';
import { reportFixture } from './fixtures';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
beforeEach(() => {
    push.mockReset();
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function setup() {
    const fixture = reportFixture();
    return render(<ReportFilters filter={fixture.filter} options={fixture.options} today="2026-09-16" />);
}
function lastParams() { return new URL(push.mock.calls.at(-1)![0], 'http://localhost').searchParams; }

describe('ReportFilters', () => {
    it('applies date, process and search as a single URL navigation', () => {
        setup();
        fireEvent.change(screen.getByLabelText('Cari produk / varian / SKU'), { target: { value: 'Hitam' } });
        fireEvent.change(screen.getByLabelText('Proses'), { target: { value: 'EXTRUSION' } });
        fireEvent.click(screen.getByRole('button', { name: 'Terapkan' }));
        expect(lastParams().get('q')).toBe('Hitam');
        expect(lastParams().get('process')).toBe('EXTRUSION');
        expect(lastParams().get('page')).toBe('1');
    });
    it('presets use server WIB dates and reset clears all filters', () => {
        setup();
        fireEvent.click(screen.getByRole('button', { name: 'Bulan lalu' }));
        expect(lastParams().get('from')).toBe('2026-08-01');
        expect(lastParams().get('to')).toBe('2026-08-31');
        fireEvent.click(screen.getByRole('button', { name: 'Reset filter' }));
        expect(push).toHaveBeenLastCalledWith('/production/output-report');
    });
    it('shows validation instead of requesting an invalid long period', () => {
        setup();
        fireEvent.change(screen.getByLabelText('Dari (WIB)'), { target: { value: '2024-01-01' } });
        fireEvent.submit(screen.getByRole('form'));
        expect(screen.getByRole('alert').textContent).toContain('366');
        expect(push).not.toHaveBeenCalled();
    });
    it('searchable product/operator/machine options preserve IDs and clear to Semua', async () => {
        setup();
        for (const [label, option] of [['Produk', 'Produk Uji · Hitam (TEST-WIP)'], ['Operator', 'Operator Uji'], ['Mesin', 'EX-01']]) {
            fireEvent.click(screen.getByRole('combobox', { name: label }));
            fireEvent.click(await screen.findByRole('option', { name: option }));
        }
        fireEvent.click(screen.getByRole('button', { name: 'Terapkan' }));
        expect(lastParams().get('productVariantId')).toBe('variant-test');
        expect(lastParams().get('operatorId')).toBe('operator-test');
        expect(lastParams().get('machineId')).toBe('machine-test');
        // Allow Radix's close-focus restoration to finish before reopening.
        await new Promise(resolve => setTimeout(resolve, 30));
        fireEvent.click(screen.getByRole('combobox', { name: 'Produk' }));
        const search = await screen.findByRole('combobox', { name: 'Cari Produk' });
        fireEvent.focus(search);
        fireEvent.change(search, { target: { value: 'TEST-WIP' } });
        expect(await screen.findByRole('option', { name: 'Produk Uji · Hitam (TEST-WIP)' })).toBeTruthy();
        fireEvent.change(search, { target: { value: '' } });
        fireEvent.click(await screen.findByRole('option', { name: 'Semua Produk' }));
        fireEvent.click(screen.getByRole('button', { name: 'Terapkan' }));
        await waitFor(() => expect(lastParams().has('productVariantId')).toBe(false));
    });
    it('keeps a selected historical ID visible when period options are empty', () => {
        const fixture = reportFixture();
        render(<ReportFilters filter={{ ...fixture.filter, operatorId: 'old-id' }} options={{ products: [], operators: [], machines: [] }} today="2026-09-16" />);
        expect(screen.getByRole('combobox', { name: 'Operator' }).textContent).toContain('Pilihan tersimpan');
    });
});
