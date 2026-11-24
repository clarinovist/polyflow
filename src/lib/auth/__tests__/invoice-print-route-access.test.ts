import { describe, expect, it } from 'vitest';
import {
    canAccessWorkspace,
    isPathAllowedByResources,
} from '../access-policy';

const SALES_PRINT_PATH = '/sales/invoices/invoice-1/print';
const FINANCE_PRINT_PATH = '/finance/invoices/sales/invoice-1/print';
const SALES_INVOICES_RESOURCE = '/sales/invoices';

function userWith(role: string, allowedResources: string[]) {
    return { role, roles: [role], allowedResources };
}

describe('sales invoice print route access', () => {
    it('lets MARKETING with the /sales/invoices resource open the print page', () => {
        const marketing = userWith('MARKETING', [SALES_INVOICES_RESOURCE]);

        expect(canAccessWorkspace(marketing, 'sales', SALES_PRINT_PATH)).toBe(
            true,
        );
        expect(
            isPathAllowedByResources(SALES_PRINT_PATH, marketing.allowedResources),
        ).toBe(true);
    });

    it('lets SALES with the /sales/invoices resource open the print page', () => {
        const sales = userWith('SALES', [SALES_INVOICES_RESOURCE]);

        expect(canAccessWorkspace(sales, 'sales', SALES_PRINT_PATH)).toBe(true);
    });

    it('rejects the print page by resource grant for a MARKETING user without /sales/invoices', () => {
        const marketing = userWith('MARKETING', ['/sales/orders']);

        // The role policy admits MARKETING to the sales workspace; the sales
        // layout then applies this resource check to deep paths and redirects.
        expect(canAccessWorkspace(marketing, 'sales', SALES_PRINT_PATH)).toBe(
            true,
        );
        expect(
            isPathAllowedByResources(SALES_PRINT_PATH, marketing.allowedResources),
        ).toBe(false);
    });

    it('denies WAREHOUSE the sales print page', () => {
        const warehouse = userWith('WAREHOUSE', ['/warehouse']);

        expect(canAccessWorkspace(warehouse, 'sales', SALES_PRINT_PATH)).toBe(
            false,
        );
        expect(
            isPathAllowedByResources(SALES_PRINT_PATH, warehouse.allowedResources),
        ).toBe(false);
    });

    it('denies PRODUCTION the sales print page', () => {
        const production = userWith('PRODUCTION', ['/production']);

        expect(
            canAccessWorkspace(production, 'sales', SALES_PRINT_PATH),
        ).toBe(false);
    });

    it('keeps the finance print page closed for MARKETING', () => {
        const withInvoices = userWith('MARKETING', [SALES_INVOICES_RESOURCE]);
        const withWholeSales = userWith('MARKETING', ['/sales']);

        expect(
            canAccessWorkspace(withInvoices, 'finance', FINANCE_PRINT_PATH),
        ).toBe(false);
        expect(
            canAccessWorkspace(withWholeSales, 'finance', FINANCE_PRINT_PATH),
        ).toBe(false);
        expect(
            canAccessWorkspace(withInvoices, 'finance', '/finance'),
        ).toBe(false);
    });

    it('keeps the finance print page closed for SALES', () => {
        const sales = userWith('SALES', [SALES_INVOICES_RESOURCE]);

        expect(canAccessWorkspace(sales, 'finance', FINANCE_PRINT_PATH)).toBe(
            false,
        );
    });

    it('keeps the finance print page open for FINANCE and ADMIN', () => {
        expect(
            canAccessWorkspace(
                userWith('FINANCE', ['/finance']),
                'finance',
                FINANCE_PRINT_PATH,
            ),
        ).toBe(true);
        expect(
            canAccessWorkspace(userWith('ADMIN', []), 'finance', FINANCE_PRINT_PATH),
        ).toBe(true);
    });
});
