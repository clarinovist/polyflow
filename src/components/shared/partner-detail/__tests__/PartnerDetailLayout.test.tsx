// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PartnerDetailLayout, PartnerDisclosure } from '../PartnerDetailLayout';

afterEach(cleanup);

describe('compact partner shell', () => {
    it('integrates back navigation with identity and leaves padding to the portal', () => {
        const { container } = render(<PartnerDetailLayout kind="Customer" name="Customer Contoh" code="CUS-1" isActive backHref="/sales/customers" profile={<p>Kontak</p>} actions={<button>Edit profil</button>}><p>Table area</p></PartnerDetailLayout>);
        const header = container.querySelector('header')!;
        expect(header.contains(screen.getByRole('link', { name: 'Daftar customer' }))).toBe(true);
        expect(header.contains(screen.getByRole('heading', { name: 'Customer Contoh' }))).toBe(true);
        expect(screen.queryByText('Detail Customer')).toBeNull();
        expect(screen.queryByRole('heading', { name: 'Profil customer' })).toBeNull();
        expect(container.firstElementChild?.className).not.toMatch(/(?:^|\s)(?:\w+:)?p-\d/);
        const toggle = screen.getByRole('button', { name: 'Profil customer' });
        const content = document.getElementById(toggle.getAttribute('aria-controls')!)!;
        expect(content.classList.contains('hidden')).toBe(true);
        fireEvent.click(toggle);
        expect(content.classList.contains('hidden')).toBe(false);
    });

    it('collapses optional settings without unmounting/resetting an edited form', () => {
        render(<PartnerDisclosure title="Pengaturan tambahan"><label>Catatan<input defaultValue="Awal" /></label></PartnerDisclosure>);
        const summary = screen.getByText('Pengaturan tambahan');
        const details = summary.closest('details')!;
        expect(details.open).toBe(false);
        fireEvent.click(summary);
        expect(details.open).toBe(true);
        const input = screen.getByRole('textbox', { name: 'Catatan' });
        fireEvent.change(input, { target: { value: 'Belum disimpan' } });
        fireEvent.click(summary);
        expect(details.open).toBe(false);
        fireEvent.click(summary);
        expect(screen.getByRole('textbox', { name: 'Catatan' })).toBe(input);
        expect((input as HTMLInputElement).value).toBe('Belum disimpan');
    });
});
