// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { useForm, useWatch, type UseFormReturn } from 'react-hook-form';
import { Form } from '@/components/ui/form';
import { Table, TableBody, TableRow } from '@/components/ui/table';
import { DEFAULT_PPN_PERCENT } from '@/lib/utils/ppn';
import { DesktopPriceCell } from '../order-form/DesktopPriceCell';
import { DesktopTaxCell } from '../order-form/DesktopTaxCell';
import { DesktopOrderTotals, MobileOrderTotals } from '../order-form/OrderTotals';
import { CustomItemDialog } from '../order-form/CustomItemDialog';
import { MobileProductSearchDialog } from '../order-form/MobileProductSearchDialog';
import { OrderHeaderFields } from '../order-form/OrderHeaderFields';
import type { SalesOrderFormValues } from '../order-form/types';

// Real RHF and UI primitives. These tests isolate render/callback contracts,
// not server policy or the unresolved INCLUDE DPP-other semantics.
const scrollDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
        observe() {}
        unobserve() {}
        disconnect() {}
    });
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    if (scrollDescriptor) Object.defineProperty(Element.prototype, 'scrollIntoView', scrollDescriptor);
    else Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
});

function FormHarness({ children }: { children: (form: UseFormReturn<SalesOrderFormValues>) => ReactNode }) {
    const form = useForm<SalesOrderFormValues>({
        defaultValues: {
            sourceLocationId: '', orderDate: new Date('2026-09-14T12:00:00Z'), shippingCost: 25,
            items: [{ productVariantId: 'synthetic-product', quantity: 2, unitPrice: 500, taxPercent: 0, ppnMode: 'EXCLUDE', dppOtherAmount: null }],
        },
    });
    const values = useWatch({ control: form.control });
    return <Form {...form}>{children(form)}<output data-testid="form-values">{JSON.stringify(values)}</output></Form>;
}
function values(): SalesOrderFormValues {
    return JSON.parse(screen.getByTestId('form-values').textContent || '{}') as SalesOrderFormValues;
}
function PriceCellHarness({ form }: { form: UseFormReturn<SalesOrderFormValues> }) {
    const [rawPriceInputs, setRawPriceInputs] = useState<Record<number, string>>({});
    return <Table><TableBody><TableRow><DesktopPriceCell
        form={form} index={0} rawPriceInputs={rawPriceInputs} setRawPriceInputs={setRawPriceInputs}
        variant={undefined} getPriceSourceLabel={() => 'Harga default'}
    /></TableRow></TableBody></Table>;
}
function TaxCellHarness({ form }: { form: UseFormReturn<SalesOrderFormValues> }) {
    const [taxableItems, setTaxableItems] = useState<Record<number, boolean>>({});
    return <Table><TableBody><TableRow><DesktopTaxCell
        form={form} index={0} taxableItems={taxableItems} setTaxableItems={setTaxableItems}
        afterDisc={1000} tax={0}
    /></TableRow></TableBody></Table>;
}

describe('sales order render extraction seams', () => {
    it.each([
        { isOverLimit: true, isNearLimit: false, title: 'Batas kredit akan terlampaui', color: 'border-red-300' },
        { isOverLimit: false, isNearLimit: true, title: 'Kredit mendekati batas', color: 'border-amber-300' },
        { isOverLimit: false, isNearLimit: false, title: 'Informasi kredit', color: 'border-green-300' },
    ])('renders the parent-provided credit state: $title', ({ isOverLimit, isNearLimit, title, color }) => {
        const props: Omit<ComponentProps<typeof OrderHeaderFields>, 'form'> = {
            customers: [], setOpenNewCustomer: vi.fn(), isOverLimit, isNearLimit,
            watchCustomerId: 'synthetic-customer', loadingExposure: false,
            creditExposure: { creditLimit: 1000, unpaidInvoiceBalance: 200, openOrderWithoutInvoice: 100, currentExposure: 300, headroom: 700 },
            headroomAfterProposal: 50, sourceLocationLabel: 'Synthetic warehouse',
            sourceLocationPlaceholder: 'Choose warehouse', sourceLocationDescription: 'Optional warehouse',
            isLocationRequired: false, selectableLocations: [], lockedOrderType: 'MAKE_TO_STOCK',
            mode: 'create', selectedOrderType: 'MAKE_TO_STOCK', documentIntent: 'order', salesTeam: [],
        };
        render(<FormHarness>{form => <OrderHeaderFields form={form} {...props} />}</FormHarness>);
        const alert = screen.getByRole('alert');
        expect(within(alert).getByText(title)).toBeDefined();
        expect(alert.className).toContain(color);
        expect(within(alert).getByText(/700/)).toBeDefined();
        if (isOverLimit) {
            expect(within(alert).getByText('Konfirmasi akan gagal — total melebihi limit kredit.')).toBeDefined();
        } else {
            expect(within(alert).getByText(/Akan melebihi jika confirm/)).toBeDefined();
        }
        expect(screen.queryByText('Jadwal Follow-up')).toBeNull();
    });

    it('keeps desktop Indonesian price input, free-item writes, and input identity', () => {
        render(<FormHarness>{form => <PriceCellHarness form={form} />}</FormHarness>);
        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: '1.250,50' } });
        fireEvent.blur(input);
        expect(values().items[0].unitPrice).toBe(1250.5);
        fireEvent.click(screen.getByRole('checkbox', { name: 'Sampel / Gratis' }));
        expect(values().items[0]).toMatchObject({ unitPrice: 0, isFreeItem: true });
        expect(screen.getByRole('textbox')).toBe(input);
        expect(input).toHaveProperty('value', '0');
        fireEvent.click(screen.getByRole('checkbox', { name: 'Sampel / Gratis' }));
        expect(values().items[0]).toMatchObject({ unitPrice: 0, isFreeItem: false });
    });

    it('keeps tax toggle defaults, popup fields, and clearing order without moving the DPP effect', async () => {
        render(<FormHarness>{form => <TaxCellHarness form={form} />}</FormHarness>);
        fireEvent.click(screen.getByRole('checkbox', { name: 'PPN' }));
        expect(values().items[0]).toMatchObject({ taxPercent: DEFAULT_PPN_PERCENT, ppnMode: 'INCLUDE' });
        fireEvent.click(within(screen.getByRole('cell')).getByRole('button'));
        expect(await screen.findByText('Opsi Pajak Lanjutan')).toBeDefined();
        fireEvent.click(screen.getByRole('radio', { name: 'Exclude (harga + pajak)' }));
        expect(values().items[0].ppnMode).toBe('EXCLUDE');
        const dpp = screen.getByPlaceholderText('Auto (11/12)');
        fireEvent.change(dpp, { target: { value: '800' } });
        expect(values().items[0].dppOtherAmount).toBe(800);
        fireEvent.change(dpp, { target: { value: '' } });
        expect(values().items[0].dppOtherAmount).toBeNull();
        fireEvent.keyDown(dpp, { key: 'Escape' });
        fireEvent.click(screen.getByRole('checkbox', { name: 'PPN' }));
        expect(values().items[0]).toMatchObject({ taxPercent: 0, dppOtherAmount: null, ppnMode: 'EXCLUDE' });
    });

    it('preserves the distinct desktop/mobile totals presentations and fleet lock', () => {
        const totals = { gross: 1200, discount: 200, dpp: 900, tax: 100, net: 1000, hasInclude: true };
        const { container } = render(<FormHarness>{form => <>
            <DesktopOrderTotals form={form} totals={totals} isShippingFromFleet watchShippingCost={25} />
            <MobileOrderTotals form={form} totals={totals} isShippingFromFleet watchShippingCost={25} />
        </>}</FormHarness>);
        const desktop = container.querySelector('.hidden.md\\:block');
        expect(desktop?.textContent).toContain('900');
        expect(screen.getByText(/1\.200/)).toBeDefined();
        expect(screen.getAllByText('Dari surat jalan')).toHaveLength(2);
        expect(screen.queryByRole('spinbutton')).toBeNull();
        expect(screen.getAllByText(/1\.025/)).toHaveLength(2);
    });

    it('passes both shipping inputs to the same form instance', () => {
        const totals = { gross: 1000, discount: 0, dpp: 1000, tax: 0, net: 1000, hasInclude: false };
        render(<FormHarness>{form => <>
            <DesktopOrderTotals form={form} totals={totals} isShippingFromFleet={false} watchShippingCost={25} />
            <MobileOrderTotals form={form} totals={totals} isShippingFromFleet={false} watchShippingCost={25} />
        </>}</FormHarness>);
        const [desktop, mobile] = screen.getAllByRole('spinbutton');
        expect(desktop.className).toContain('h-9');
        expect(mobile.className).toContain('h-11');
        expect(desktop).toHaveProperty('name', 'shippingCost');
        expect(mobile).toHaveProperty('name', 'shippingCost');
        fireEvent.change(mobile, { target: { value: '75' } });
        expect(values().shippingCost).toBe(75);
    });

    it('preserves custom-item Enter confirmation, autofocus, and cancellation reset ordering', async () => {
        const events: string[] = [];
        const confirm = vi.fn();
        render(<CustomItemDialog
            customItemIndex={2} customItemName="Synthetic custom" customItemPrice="750"
            setCustomItemIndex={() => events.push('index')}
            setCustomItemName={() => events.push('name')}
            setCustomItemPrice={() => events.push('price')}
            confirmCustomItem={confirm}
        />);
        const input = screen.getByRole('textbox', { name: 'Nama Produk *' });
        await waitFor(() => expect(document.activeElement).toBe(input));
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(confirm).toHaveBeenCalledOnce();
        fireEvent.click(screen.getByRole('button', { name: 'Batal' }));
        expect(events).toEqual(['index', 'name', 'price']);
    });

    it.each([
        ['Ketik Nama Produk Sendiri', 'custom'],
        ['Tambah Produk Baru', 'quick'],
    ])('closes mobile search before handing row index to %s', async (label, target) => {
        const events: unknown[] = [];
        const props: Omit<ComponentProps<typeof MobileProductSearchDialog>, 'form'> = {
            mobileProductSearch: { open: true, index: 2 },
            setMobileProductSearch: state => events.push(['search', state]),
            productEmptyMessage: 'Synthetic empty products', filteredProducts: [],
            selectProduct: vi.fn(), toDisplayUnitPrice: vi.fn(), getCustomerBasePrice: vi.fn(), getPriceSourceLabel: vi.fn(),
            setCustomItemIndex: index => events.push(['custom', index]),
            setQuickAddIndex: index => events.push(['quick', index]),
        };
        render(<FormHarness>{form => <MobileProductSearchDialog form={form} {...props} />}</FormHarness>);
        fireEvent.click(await screen.findByRole('option', { name: new RegExp(label) }));
        expect(events).toEqual([['search', { open: false, index: 0 }], [target, 2]]);
        expect(props.selectProduct).not.toHaveBeenCalled();
    });
});
