// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SalesOrderCustomerPicker } from '../SalesOrderCustomerPicker';
import { SalesOrderForm } from '../SalesOrderForm';

vi.mock('next/navigation', () => ({
    useRouter: () => ({ back: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/actions/sales/sales-team', () => ({
    getSalesTeamAction: vi.fn().mockResolvedValue({ data: [] }),
}));
vi.mock('@/actions/sales/sales', () => ({
    createSalesOrder: vi.fn(),
    updateSalesOrder: vi.fn(),
}));
vi.mock('@/actions/sales/customer', () => ({
    getCustomerCreditExposureAction: vi.fn().mockResolvedValue({ data: null }),
}));
vi.mock('@/components/customers/CustomerDialog', () => ({
    CustomerDialog: () => null,
}));
vi.mock('../QuickProductDialog', () => ({
    QuickProductDialog: () => null,
}));

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
    {
        id: 'customer-duplicate-1',
        name: 'Toko Kembar',
        code: 'KMB-001',
        city: 'Bandung',
        billingAddress: 'Jalan Mawar 1',
        shippingAddress: null,
        phone: '0812-1111-1111',
        creditLimit: 15_000_000,
    },
    {
        id: 'customer-duplicate-2',
        name: 'Toko Kembar',
        code: null,
        city: 'Surabaya',
        billingAddress: null,
        shippingAddress: 'Jalan Melati 2',
        phone: '0822-2222-2222',
        creditLimit: 7_500_000,
    },
];

function renderPicker(
    props: Partial<React.ComponentProps<typeof SalesOrderCustomerPicker>> = {},
) {
    const onChange = vi.fn();
    const onAddCustomer = vi.fn();
    render(
        <SalesOrderCustomerPicker
            customers={customers}
            value=""
            onChange={onChange}
            onAddCustomer={onAddCustomer}
            {...props}
        />,
    );
    return { onChange, onAddCustomer };
}

async function openPicker() {
    fireEvent.click(screen.getByRole('combobox'));
    return screen.findByPlaceholderText('Cari customer...');
}

describe('SalesOrderCustomerPicker', () => {
    it('keeps duplicate names separate and shows stable identity, context, and credit', async () => {
        renderPicker();
        const trigger = screen.getByRole('combobox');
        await openPicker();

        const listbox = screen.getByRole('listbox');
        const controlledPopup = document.getElementById(
            trigger.getAttribute('aria-controls') || '',
        );
        expect(controlledPopup?.contains(listbox)).toBe(true);

        const options = screen.getAllByRole('option');
        expect(options).toHaveLength(3);

        expect(within(options[0]).getByText('Toko Kembar')).toBeDefined();
        expect(within(options[0]).getByText('KMB-001')).toBeDefined();
        expect(options[0].textContent).toContain('Bandung');
        expect(options[0].textContent).toContain('Jalan Mawar 1');
        expect(options[0].textContent).toContain('0812-1111-1111');
        expect(options[0].textContent).toContain('Limit:');
        expect(options[0].textContent).toContain('15.000.000');

        expect(within(options[1]).getByText('Toko Kembar')).toBeDefined();
        expect(
            within(options[1]).getByText('ID: customer-duplicate-2'),
        ).toBeDefined();
        expect(options[1].textContent).toContain('Surabaya');
        expect(options[1].textContent).toContain('Jalan Melati 2');
        expect(options[1].textContent).toContain('0822-2222-2222');
        expect(options[1].textContent).toContain('Limit:');
        expect(options[1].textContent).toContain('7.500.000');
    });

    it.each([
        ['code', 'KMB-001', 'customer-duplicate-1'],
        ['city', 'Surabaya', 'customer-duplicate-2'],
        ['address', 'Jalan Mawar 1', 'customer-duplicate-1'],
        ['phone', '0822-2222-2222', 'customer-duplicate-2'],
    ])('searches by %s', async (_field, query, expectedId) => {
        renderPicker();
        const search = await openPicker();

        fireEvent.change(search, { target: { value: query } });

        await waitFor(() => {
            const customerOptions = screen
                .getAllByRole('option')
                .filter((option) => option.getAttribute('data-value') !== 'add-customer');
            expect(customerOptions).toHaveLength(1);
            expect(customerOptions[0].getAttribute('data-value')).toContain(expectedId);
        });
    });

    it('keeps the popover viewport-bounded and long customer content wrappable', async () => {
        renderPicker({
            customers: [
                ...customers,
                {
                    id: 'customer-with-an-extremely-long-unbroken-identity-1234567890',
                    name: 'Customer Dengan Nama Sangat Panjang Tanpa Mengubah Identitas',
                    code: 'CUSTOMER-CODE-WITHOUT-BREAK-POINTS-1234567890',
                    city: null,
                    billingAddress:
                        'Alamat pelanggan yang sangat panjang untuk memastikan konteks tetap dapat dibaca pada layar sempit',
                    shippingAddress: null,
                    phone: null,
                    creditLimit: 12_345_678,
                },
            ],
        });
        await openPicker();

        const popup = document.querySelector<HTMLElement>(
            '[data-slot="popover-content"]',
        );
        expect(popup?.className).toContain('max-w-[calc(100vw-1.5rem)]');
        expect(popup?.getAttribute('data-align')).toBe('start');

        const longOption = screen.getByRole('option', {
            name: /Customer Dengan Nama Sangat Panjang/i,
        });
        expect(within(longOption).getByText(/CUSTOMER-CODE-WITHOUT/).className).toContain(
            'break-all',
        );
        expect(
            within(longOption).getByText(/Alamat pelanggan yang sangat panjang/).className,
        ).toContain('break-words');
        const creditLimit = within(longOption).getByText(/Limit:/);
        expect(creditLimit.className).toContain('w-full');
        expect(creditLimit.className).toContain('sm:w-auto');
    });

    it('emits the exact ID when selecting the second duplicate', async () => {
        const { onChange } = renderPicker();
        await openPicker();

        fireEvent.click(screen.getAllByRole('option')[1]);

        expect(onChange).toHaveBeenCalledOnce();
        expect(onChange).toHaveBeenCalledWith('customer-duplicate-2');
    });

    it('keeps add-customer searchable in Indonesian without changing selection', async () => {
        const { onAddCustomer, onChange } = renderPicker();
        const search = await openPicker();

        fireEvent.change(search, { target: { value: 'tambah customer baru' } });
        const addOption = await screen.findByRole('option', {
            name: /Tambah Customer Baru/i,
        });
        fireEvent.click(addOption);

        expect(onAddCustomer).toHaveBeenCalledOnce();
        expect(onChange).not.toHaveBeenCalled();
    });

    it('shows the selected customer identity in the trigger', () => {
        renderPicker({ value: 'customer-duplicate-2' });

        const trigger = screen.getByRole('combobox');
        expect(trigger.textContent).toContain('Toko Kembar');
        expect(trigger.textContent).toContain('ID: customer-duplicate-2');
    });

    it('dismisses with Escape without changing selection and restores focus', async () => {
        const { onChange } = renderPicker();
        const trigger = screen.getByRole('combobox');
        const search = await openPicker();

        search.focus();
        fireEvent.keyDown(search, { key: 'Escape', code: 'Escape' });

        await waitFor(() => {
            expect(trigger.getAttribute('aria-expanded')).toBe('false');
            expect(document.activeElement).toBe(trigger);
        });
        expect(onChange).not.toHaveBeenCalled();
    });

    it('closes from a visible accessible Tutup action and returns focus', async () => {
        renderPicker();
        const trigger = screen.getByRole('combobox');
        await openPicker();

        const closeButton = screen.getByRole('button', {
            name: 'Tutup pemilih customer',
        });
        expect(closeButton.textContent).toContain('Tutup');
        fireEvent.click(closeButton);

        await waitFor(() => {
            expect(trigger.getAttribute('aria-expanded')).toBe('false');
            expect(screen.queryByPlaceholderText('Cari customer...')).toBeNull();
            expect(document.activeElement).toBe(trigger);
        });
    });

    it('does not select a customer when Enter closes the picker', async () => {
        const { onChange } = renderPicker();
        await openPicker();

        const closeButton = screen.getByRole('button', {
            name: 'Tutup pemilih customer',
        });
        closeButton.focus();
        fireEvent.keyDown(closeButton, { key: 'Enter', code: 'Enter' });

        expect(onChange).not.toHaveBeenCalled();
    });

    it('clears the required error and aria-invalid after selecting a customer', async () => {
        render(
            <SalesOrderForm
                customers={customers as never}
                locations={[]}
                products={[]}
                mode="create"
                lockedOrderType="MAKE_TO_STOCK"
            />,
        );

        const customerTrigger = screen.getByRole('combobox', {
            name: /customer/i,
        });
        const form = customerTrigger.closest('form');
        expect(form).not.toBeNull();
        fireEvent.submit(form as HTMLFormElement);

        expect(
            await screen.findByText(
                'Customer is required for Sales Orders. Use Production Order for internal stock build.',
            ),
        ).toBeDefined();
        expect(customerTrigger.getAttribute('aria-invalid')).toBe('true');

        fireEvent.click(customerTrigger);
        fireEvent.click(await screen.findByText('KMB-001'));

        await waitFor(() => {
            expect(
                screen.queryByText(
                    'Customer is required for Sales Orders. Use Production Order for internal stock build.',
                ),
            ).toBeNull();
            expect(customerTrigger.getAttribute('aria-invalid')).toBe('false');
        });
    });
});
