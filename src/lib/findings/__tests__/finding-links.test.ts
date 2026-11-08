import { describe, expect, it } from 'vitest';
import { findingEntityHref } from '../finding-links';

describe('findingEntityHref', () => {
    it.each([
        ['Invoice', 'overdue_ar', 'x', '/finance/invoices/sales/abc'],
        ['PurchaseInvoice', 'overdue_ap', 'x', '/finance/invoices/purchase/abc'],
        ['SalesOrder', 'stuck_so', 'x', '/sales/orders/abc'],
        ['ProductionOrder', 'production_no_progress', 'x', '/production/orders/abc'],
        ['ProductVariant', 'critical_stock', 'x', '/warehouse/inventory/abc'],
    ])('links %s entities to their detail page', (entityType, detector, fp, href) => {
        expect(
            findingEntityHref({ entityType, entityId: 'abc', detector, fingerprint: fp }),
        ).toBe(href);
    });

    it('sends a customer payment to the received-payments list', () => {
        expect(
            findingEntityHref({
                entityType: 'Payment',
                entityId: 'p1',
                detector: 'missing_finance_journal',
                fingerprint: 'missing_finance_journal:SALES_PAYMENT:p1',
            }),
        ).toBe('/finance/payments/received');
    });

    it('sends a supplier payment to the sent-payments list', () => {
        expect(
            findingEntityHref({
                entityType: 'Payment',
                entityId: 'p2',
                detector: 'missing_finance_journal',
                fingerprint: 'missing_finance_journal:PURCHASE_PAYMENT:p2',
            }),
        ).toBe('/finance/payments/sent');
    });

    it('sends a barter settlement to the journal list', () => {
        expect(
            findingEntityHref({
                entityType: 'BarterSettlement',
                entityId: 'b1',
                detector: 'missing_finance_journal',
                fingerprint: 'missing_finance_journal:BARTER:b1:x',
            }),
        ).toBe('/finance/journals');
    });

    it('encodes the entity id so it cannot break out of the path', () => {
        expect(
            findingEntityHref({
                entityType: 'Invoice',
                entityId: '../x?y#z',
                detector: 'overdue_ar',
                fingerprint: 'f',
            }),
        ).toBe('/finance/invoices/sales/..%2Fx%3Fy%23z');
    });

    it('returns null for a missing id or an unknown entity type', () => {
        expect(
            findingEntityHref({ entityType: 'Invoice', entityId: null, detector: 'overdue_ar', fingerprint: 'f' }),
        ).toBeNull();
        expect(
            findingEntityHref({ entityType: 'Mystery', entityId: '1', detector: 'overdue_ar', fingerprint: 'f' }),
        ).toBeNull();
        expect(
            findingEntityHref({ entityType: null, entityId: '1', detector: 'overdue_ar', fingerprint: 'f' }),
        ).toBeNull();
    });
});
