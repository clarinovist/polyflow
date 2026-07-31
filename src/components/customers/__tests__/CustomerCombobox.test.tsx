// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CustomerCombobox } from '../CustomerCombobox';

vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    },
);
Element.prototype.scrollIntoView = vi.fn();

const customers = [
    { id: 'customer-1', name: 'Toko Melati', code: 'MLT-01' },
    { id: 'customer-2', name: 'CV Anggrek', code: 'ANG-02' },
];

function renderCombobox(
    props: Partial<React.ComponentProps<typeof CustomerCombobox>> = {},
) {
    const onChange = vi.fn();
    render(
        <CustomerCombobox
            customers={customers}
            value=""
            onChange={onChange}
            {...props}
        />,
    );
    return { onChange };
}

async function openCombobox() {
    fireEvent.click(screen.getByRole('combobox'));
    return screen.findByPlaceholderText('Cari nama atau kode customer...');
}

describe('CustomerCombobox', () => {
    it('menampilkan placeholder saat belum ada customer terpilih', () => {
        renderCombobox();

        expect(screen.getByRole('combobox').textContent).toContain(
            'Pilih customer...',
        );
    });

    it('menampilkan nama customer saat value terisi', () => {
        renderCombobox({ value: 'customer-2' });

        expect(screen.getByRole('combobox').textContent).toContain('CV Anggrek');
    });

    it('memfilter daftar berdasarkan nama yang diketik', async () => {
        const search = await openComboboxAfterRender();

        fireEvent.change(search, { target: { value: 'Melati' } });

        await waitFor(() => {
            expect(screen.queryByText('CV Anggrek')).toBeNull();
        });
        expect(screen.getByText('Toko Melati')).toBeDefined();
    });

    it('memfilter daftar berdasarkan kode customer', async () => {
        const search = await openComboboxAfterRender();

        fireEvent.change(search, { target: { value: 'ANG-02' } });

        await waitFor(() => {
            expect(screen.queryByText('Toko Melati')).toBeNull();
        });
        expect(screen.getByText('CV Anggrek')).toBeDefined();
    });

    it('memanggil onChange dengan id customer saat item dipilih', async () => {
        const { onChange } = renderCombobox();
        await openCombobox();

        fireEvent.click(screen.getByText('CV Anggrek'));

        expect(onChange).toHaveBeenCalledWith('customer-2');
        await waitFor(() => {
            expect(
                screen.queryByPlaceholderText('Cari nama atau kode customer...'),
            ).toBeNull();
        });
    });

    it('menampilkan pesan kosong saat tidak ada yang cocok', async () => {
        const search = await openComboboxAfterRender();

        fireEvent.change(search, { target: { value: 'tidak tersedia' } });

        expect(
            await screen.findByText('Customer tidak ditemukan.'),
        ).toBeDefined();
    });

    it('tidak membuka daftar saat disabled', () => {
        renderCombobox({ disabled: true });
        const trigger = screen.getByRole('combobox') as HTMLButtonElement;

        fireEvent.click(trigger);

        expect(trigger.disabled).toBe(true);
        expect(
            screen.queryByPlaceholderText('Cari nama atau kode customer...'),
        ).toBeNull();
    });
});

async function openComboboxAfterRender() {
    renderCombobox();
    return openCombobox();
}
