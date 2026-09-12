// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { UrlTransactionDateFilter } from '@/components/common/url-transaction-date-filter';
import { OrderPeriodHint } from '../OrderPeriodHint';
import { SalesOrderTable } from '../SalesOrderTable';

const routerPush = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: routerPush }),
    useSearchParams: () => new URLSearchParams(window.location.search),
}));

const ORIGINAL_TZ = process.env.TZ;

type SalesOrderTableProps = ComponentProps<typeof SalesOrderTable>;
type SalesOrderRow = SalesOrderTableProps['initialData'][number];

function quotationOrder(): SalesOrderRow {
    return {
        id: 'order-1',
        orderNumber: 'SO-001',
        orderDate: new Date('2026-08-31T17:00:00.000Z'),
        status: 'QUOTATION',
        orderType: 'MAKE_TO_ORDER',
        totalAmount: 100_000,
        nextFollowUpDate: '2026-09-10T17:00:00.000Z',
        customer: null,
        sourceLocation: null,
        items: [],
        invoices: [],
        _count: { items: 0 },
    } as unknown as SalesOrderRow;
}

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    routerPush.mockClear();
    window.history.replaceState(null, '', '/');
    if (ORIGINAL_TZ === undefined) {
        delete process.env.TZ;
    } else {
        process.env.TZ = ORIGINAL_TZ;
    }
});

describe('Sales Orders hydration safety', () => {
    it('requires a server-owned business day', () => {
        expectTypeOf<SalesOrderTableProps['businessToday']>().toEqualTypeOf<string>();
    });

    it('formats period boundaries as Asia/Jakarta calendar dates', () => {
        const html = renderToString(
            <OrderPeriodHint
                start={new Date('2026-08-31T17:00:00.000Z')}
                end={new Date('2026-09-30T16:59:59.999Z')}
                displayedCount={3}
            />,
        );

        expect(html).toContain('September 2026 (1–30 Sep 2026)');
    });

    it('formats order and follow-up dates from a stable WIB business day', () => {
        render(
            <SalesOrderTable
                initialData={[quotationOrder()]}
                businessToday="2026-09-12"
            />,
        );

        expect(screen.getAllByText('Sep 1, 2026').length).toBeGreaterThan(0);
        expect(screen.getByText('11 Sep 2026 · Terlambat')).toBeTruthy();
    });

    it('recomputes overdue columns when the server business day changes', () => {
        const view = render(
            <SalesOrderTable
                initialData={[quotationOrder()]}
                businessToday="2026-09-11"
            />,
        );

        expect(screen.getByText('11 Sep 2026')).toBeTruthy();
        view.rerender(
            <SalesOrderTable
                initialData={[quotationOrder()]}
                businessToday="2026-09-12"
            />,
        );
        expect(screen.getByText('11 Sep 2026 · Terlambat')).toBeTruthy();
    });

    it('server-renders and hydrates the date-sensitive table without console errors', async () => {
        const element = (
            <SalesOrderTable
                initialData={[quotationOrder()]}
                businessToday="2026-09-12"
            />
        );
        const container = document.createElement('div');
        const consoleError = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {});
        let root: Root | undefined;

        try {
            container.innerHTML = renderToString(element);
            await act(async () => {
                root = hydrateRoot(container, element);
            });

            expect(consoleError).not.toHaveBeenCalled();
        } finally {
            if (root) {
                await act(async () => root?.unmount());
            }
            consoleError.mockRestore();
        }
    });

    it('displays exact WIB URL bounds as the same calendar range under TZ=UTC', () => {
        process.env.TZ = 'UTC';
        window.history.replaceState(
            null,
            '',
            '/?startDate=2026-08-31T17%3A00%3A00.000Z&endDate=2026-09-30T16%3A59%3A59.999Z',
        );

        render(<UrlTransactionDateFilter presetTimeZone="Asia/Jakarta" />);

        expect(
            screen.getByRole('button', {
                name: /Sep 01, 2026 - Sep 30, 2026/,
            }),
        ).toBeTruthy();
    });

    it('serializes the Jakarta month preset to exact WIB UTC bounds under TZ=UTC', () => {
        process.env.TZ = 'UTC';
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-31T18:00:00.000Z'));
        render(<UrlTransactionDateFilter presetTimeZone="Asia/Jakarta" />);

        fireEvent.click(screen.getByRole('button', { name: 'Semua Waktu' }));
        fireEvent.click(screen.getByRole('button', { name: 'Bulan Ini' }));

        const pushedUrl = routerPush.mock.calls[0][0] as string;
        const pushedParams = new URLSearchParams(pushedUrl.slice(1));
        expect(pushedParams.get('startDate')).toBe(
            '2026-08-31T17:00:00.000Z',
        );
        expect(pushedParams.get('endDate')).toBe(
            '2026-09-30T16:59:59.999Z',
        );
    });
});
