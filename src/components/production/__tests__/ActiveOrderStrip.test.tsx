// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ActiveOrderStrip } from '../ActiveOrderStrip';
import type { ActiveOrderNavItem } from '@/actions/production/active-order-nav';

function item(overrides: Partial<ActiveOrderNavItem> = {}): ActiveOrderNavItem {
    return {
        id: 'order-1',
        orderNumber: 'WO-260903-001',
        status: 'IN_PROGRESS',
        productName: 'Sedotan Bening',
        plannedQuantity: 100,
        actualQuantity: 25,
        progressPercent: 25,
        ...overrides,
    };
}

describe('ActiveOrderStrip', () => {
    it('renders nothing when there is only one active SPK', () => {
        // Nowhere to navigate — the strip would just repeat the page header.
        const { container } = render(
            <ActiveOrderStrip orders={[item()]} currentOrderId="order-1" />,
        );

        expect(container.firstChild).toBeNull();
    });

    it('links every other SPK so the board is not needed to switch', () => {
        // Regression guard for the 939 detail<->daily round trips in 30 days:
        // the detail page previously had no link to any other work order.
        const { container } = render(
            <ActiveOrderStrip
                orders={[
                    item(),
                    item({ id: 'order-2', orderNumber: 'WO-260903-002' }),
                ]}
                currentOrderId="order-1"
            />,
        );

        const hrefs = Array.from(container.querySelectorAll('a')).map((a) =>
            a.getAttribute('href'),
        );
        expect(hrefs).toContain('/production/orders/order-1');
        expect(hrefs).toContain('/production/orders/order-2');
    });

    it('marks the current SPK with aria-current for assistive tech', () => {
        const { container } = render(
            <ActiveOrderStrip
                orders={[item(), item({ id: 'order-2' })]}
                currentOrderId="order-2"
            />,
        );

        const current = container.querySelector('a[aria-current="page"]');
        expect(current?.getAttribute('href')).toBe(
            '/production/orders/order-2',
        );
    });

    it('shows the position of the current SPK within the active list', () => {
        const { getByText } = render(
            <ActiveOrderStrip
                orders={[item(), item({ id: 'order-2' }), item({ id: 'order-3' })]}
                currentOrderId="order-2"
            />,
        );

        expect(getByText('2 dari 3')).toBeTruthy();
    });

    it('falls back to a plain count when the current SPK is not active', () => {
        // Opening a COMPLETED work order directly: it is not in the active
        // list, so a "N dari M" position would be a lie.
        const { getByText } = render(
            <ActiveOrderStrip
                orders={[item(), item({ id: 'order-2' })]}
                currentOrderId="order-completed"
            />,
        );

        expect(getByText('2 SPK')).toBeTruthy();
    });
});
