// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { OrderDetailClient } from '../OrderDetailClient';
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/actions/sales/sales', () => ({ confirmSalesOrder: vi.fn(), deliverSalesOrder: vi.fn(), cancelSalesOrder: vi.fn(), markReadyToShip: vi.fn(), shipSalesOrder: vi.fn() }));
vi.mock('@/actions/sales/sales-returns', () => ({ createSalesReturnAction: vi.fn() }));
vi.mock('@/components/sales/CreateDeliveryOrderDialog', () => ({ CreateDeliveryOrderDialog: () => null }));
vi.mock('@/components/shared/EntityStatusTimeline', () => ({ EntityStatusTimeline: () => null }));
afterEach(cleanup);
it('shows delivery identity/status inline and hands off dispatch without a blocked desktop link', () => {
    render(<OrderDetailClient locations={[]} order={{
        id: 'o', orderNumber: 'SYNTHETIC-SO', orderDate: '2026-09-23', status: 'CONFIRMED', totalAmount: 100, discountAmount: 0, taxAmount: 0, shippingCost: 0, notes: null, customer: null, items: [],
        deliveryOrders: [{ id: 'd', orderNumber: 'SYNTHETIC-DO', deliveryDate: '2026-09-23', status: 'PENDING', trackingNumber: null, carrier: null, notes: null, items: [] }],
    }} />);
    expect(screen.getByText('SYNTHETIC-DO')).toBeTruthy();
    expect(screen.getAllByText(/petugas gudang yang berwenang/).length).toBeGreaterThan(0);
    expect(document.querySelector('a[href^="/sales/deliveries"]')).toBeNull();
});
