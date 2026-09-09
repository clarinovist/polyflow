// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { Supplier } from '@prisma/client';
import { SupplierListClient } from '../SupplierListClient';

const { dialog, deletion, deleteSupplier } = vi.hoisted(() => ({
    dialog: vi.fn(), deletion: vi.fn(), deleteSupplier: vi.fn(),
}));
vi.mock('@/actions/purchasing/supplier', () => ({ deleteSupplier }));
vi.mock('../SupplierDialog', () => ({ SupplierDialog: (props: { mode: string; initialData?: Supplier }) => {
    dialog(props);
    return <button>{props.mode === 'create' ? 'Tambah Supplier' : `Edit ${props.initialData?.name}`}</button>;
} }));
vi.mock('@/components/common/DeleteButton', () => ({ DeleteButton: (props: { id: string }) => {
    deletion(props);
    return <button>Hapus {props.id}</button>;
} }));

function supplier(overrides: Partial<Supplier>): Supplier {
    return {
        id: 's1', name: 'Alpha Supply', code: 'SUP-ALPHA', phone: '081234',
        address: 'Alamat A', email: 'supplier@example.test', isActive: true,
        taxId: 'TAX-1', paymentTermDays: 30, bankName: 'Bank A', bankAccount: 'ACCOUNT-1', notes: 'Full edit data',
        createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
        ...overrides,
    };
}
const suppliers = [
    supplier({}),
    supplier({ id: 's2', name: 'Beta Supply', code: 'SUP-BETA', phone: '089876', isActive: false }),
    supplier({ id: 's3', name: 'Gamma Supply', code: null, phone: null, address: null }),
];
const desktop = () => within(screen.getByTestId('supplier-desktop-list'));
const mobile = () => within(screen.getByTestId('supplier-mobile-list'));
function search(value: string) { fireEvent.change(screen.getByRole('textbox', { name: 'Cari supplier' }), { target: { value } }); }
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('SupplierListClient', () => {
    it('links supplier names to details in desktop and mobile, with no eye buttons', () => {
        const { container } = render(<SupplierListClient suppliers={suppliers} />);
        for (const list of [desktop(), mobile()]) {
            expect(list.getAllByRole('link')).toHaveLength(3);
            for (const item of suppliers) {
                expect(list.getByRole('link', { name: item.name }).getAttribute('href')).toBe(`/purchasing/suppliers/${item.id}`);
            }
        }
        expect(container.querySelector('.lucide-eye')).toBeNull();
        expect(screen.getByRole('status').textContent).toBe('Menampilkan 3 dari 3 supplier');
    });

    it.each([
        ['  aLpHa  ', 'Alpha Supply'], ['sup-beta', 'Beta Supply'], ['9876', 'Beta Supply'],
    ])('searches names/codes/phones without case or surrounding-space sensitivity: %s', (query, name) => {
        render(<SupplierListClient suppliers={suppliers} />);
        search(query);
        for (const list of [desktop(), mobile()]) {
            expect(list.getAllByRole('link')).toHaveLength(1);
            expect(list.getByRole('link', { name })).toBeDefined();
        }
        expect(screen.getByRole('status').textContent).toBe('Menampilkan 1 dari 3 supplier');
    });

    it('handles missing optional fields and whitespace-only search, and clears the query', () => {
        render(<SupplierListClient suppliers={suppliers} />);
        search('  ');
        expect(desktop().getAllByRole('link')).toHaveLength(3);
        search('gamma');
        expect(desktop().getAllByText('-')).toHaveLength(3);
        fireEvent.click(screen.getByRole('button', { name: 'Hapus pencarian' }));
        expect(screen.getByRole('textbox', { name: 'Cari supplier' })).toHaveProperty('value', '');
        expect(desktop().getAllByRole('link')).toHaveLength(3);
        expect(screen.queryByRole('button', { name: 'Hapus pencarian' })).toBeNull();
    });

    it('combines status filters and search; clear search retains selected status', () => {
        render(<SupplierListClient suppliers={suppliers} />);
        fireEvent.click(screen.getByRole('button', { name: 'Aktif (2)' }));
        expect(desktop().getAllByRole('link')).toHaveLength(2);
        search('beta');
        expect(desktop().queryAllByRole('link')).toHaveLength(0);
        expect(desktop().getByText('Tidak ada supplier yang cocok.')).toBeDefined();
        fireEvent.click(screen.getByRole('button', { name: 'Nonaktif (1)' }));
        expect(desktop().getByRole('link', { name: 'Beta Supply' })).toBeDefined();
        fireEvent.click(screen.getByRole('button', { name: 'Hapus pencarian' }));
        expect(desktop().getAllByRole('link')).toHaveLength(1);
        expect(screen.getByRole('button', { name: 'Nonaktif (1)' }).getAttribute('aria-pressed')).toBe('true');
        fireEvent.click(screen.getByRole('button', { name: 'Semua (3)' }));
        expect(desktop().getAllByRole('link')).toHaveLength(3);
    });

    it('distinguishes empty data from no matching search in both layouts', () => {
        const { rerender } = render(<SupplierListClient suppliers={[]} />);
        for (const list of [desktop(), mobile()]) {
            expect(list.getByText('Belum ada supplier. Tambahkan supplier pertama Anda!')).toBeDefined();
        }
        rerender(<SupplierListClient suppliers={suppliers} />);
        search('no match');
        for (const list of [desktop(), mobile()]) {
            expect(list.getByText('Tidak ada supplier yang cocok.')).toBeDefined();
        }
    });

    it('keeps create/edit/delete wiring and full edit records without nested action links', () => {
        render(<SupplierListClient suppliers={suppliers} />);
        expect(screen.getByRole('button', { name: 'Tambah Supplier' })).toBeDefined();
        expect(dialog).toHaveBeenCalledWith(expect.objectContaining({ mode: 'create' }));
        expect(dialog).toHaveBeenCalledWith(expect.objectContaining({ mode: 'edit', initialData: suppliers[0] }));
        expect(deletion).toHaveBeenCalledWith(expect.objectContaining({ id: 's1', onDelete: deleteSupplier, entityName: 'Supplier' }));
        for (const list of [desktop(), mobile()]) {
            expect(list.getByRole('button', { name: 'Edit Alpha Supply' }).closest('a')).toBeNull();
            expect(list.getByRole('button', { name: 'Hapus s1' }).closest('a')).toBeNull();
        }
    });

    it('reflects refreshed server props after create/edit/delete instead of caching stale rows', () => {
        const { rerender } = render(<SupplierListClient suppliers={suppliers} />);
        search('alpha');
        rerender(<SupplierListClient suppliers={[supplier({ name: 'Alpha Updated' })]} />);
        expect(desktop().getByRole('link', { name: 'Alpha Updated' })).toBeDefined();
        expect(screen.getByRole('status').textContent).toBe('Menampilkan 1 dari 1 supplier');
        rerender(<SupplierListClient suppliers={[]} />);
        expect(desktop().queryAllByRole('link')).toHaveLength(0);
        expect(screen.getByRole('status').textContent).toBe('Menampilkan 0 dari 0 supplier');
    });
});
