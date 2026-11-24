import { describe, expect, it } from 'vitest';
import {
    canAccessWorkspace,
    isPathAllowedByResources,
} from '../access-policy';
import { flattenCatalog } from '../permission-catalog';
import { filterNavGroups } from '../permission-match';
import { salesLinks } from '@/components/sales/sales-sidebar';
import { financeLinks } from '@/components/finance/finance-sidebar';

const REVIEW_PATH = '/sales/claims';
const PAYMENT_PATH = '/finance/reimbursements';

function userWith(role: string, allowedResources: string[]) {
    return { role, roles: [role], allowedResources };
}

function hrefsOf(groups: { items: { href: string }[] }[]): string[] {
    return groups.flatMap((group) => group.items.map((item) => item.href));
}

describe('claim review route (/sales/claims)', () => {
    it('lets MARKETING with the default /sales grant open it', () => {
        const marketing = userWith('MARKETING', ['/sales']);

        expect(canAccessWorkspace(marketing, 'sales', REVIEW_PATH)).toBe(true);
    });

    it('lets MARKETING with only the /sales/claims grant open it', () => {
        const marketing = userWith('MARKETING', [REVIEW_PATH]);

        expect(canAccessWorkspace(marketing, 'sales', REVIEW_PATH)).toBe(true);
    });

    it('lets ADMIN open it without any resource grant', () => {
        expect(
            canAccessWorkspace(userWith('ADMIN', []), 'sales', REVIEW_PATH),
        ).toBe(true);
    });

    it('needs a covering resource grant at the layout deep-path check', () => {
        // Nested-only grants do not cover the new route: an admin must grant
        // /sales/claims (or the whole /sales) in Access Control.
        expect(isPathAllowedByResources(REVIEW_PATH, ['/sales/orders'])).toBe(false);
        expect(isPathAllowedByResources(REVIEW_PATH, ['/sales'])).toBe(true);
        expect(isPathAllowedByResources(REVIEW_PATH, [REVIEW_PATH])).toBe(true);
    });

    it('keeps warehouse and production roles out of the sales workspace', () => {
        expect(
            canAccessWorkspace(userWith('WAREHOUSE', ['/warehouse']), 'sales', REVIEW_PATH),
        ).toBe(false);
        expect(
            canAccessWorkspace(userWith('PRODUCTION', ['/production']), 'sales', REVIEW_PATH),
        ).toBe(false);
    });

    it('is admitted for SALES by the workspace policy, so the page guard is the role gate', () => {
        // Workspace policy is workspace-wide: SALES holds the /sales grant and
        // passes here. /sales/claims/page.tsx calls requireSalesManager and
        // redirects SALES (covered in src/app/sales/claims/__tests__/page.test.tsx),
        // and the sidebar hides the entry (sales-sidebar-claims.test.tsx).
        const sales = userWith('SALES', ['/sales']);

        expect(canAccessWorkspace(sales, 'sales', REVIEW_PATH)).toBe(true);
    });
});

describe('Finance reimbursement route (/finance/reimbursements)', () => {
    it('lets FINANCE with the default /finance grant open it', () => {
        expect(
            canAccessWorkspace(userWith('FINANCE', ['/finance']), 'finance', PAYMENT_PATH),
        ).toBe(true);
    });

    it('lets ADMIN open it', () => {
        expect(
            canAccessWorkspace(userWith('ADMIN', []), 'finance', PAYMENT_PATH),
        ).toBe(true);
    });

    it('keeps MARKETING out, with the whole sales grant or the claim grant', () => {
        const withSales = userWith('MARKETING', ['/sales']);
        const withClaims = userWith('MARKETING', [REVIEW_PATH]);

        expect(canAccessWorkspace(withSales, 'finance', PAYMENT_PATH)).toBe(false);
        expect(canAccessWorkspace(withClaims, 'finance', PAYMENT_PATH)).toBe(false);
    });

    it('keeps SALES out', () => {
        expect(
            canAccessWorkspace(userWith('SALES', ['/sales']), 'finance', PAYMENT_PATH),
        ).toBe(false);
    });
});

describe('claim navigation entries', () => {
    it('registers both routes in the permission catalog', () => {
        const keys = new Set(flattenCatalog().map((node) => node.key));

        expect(keys.has(REVIEW_PATH)).toBe(true);
        expect(keys.has(PAYMENT_PATH)).toBe(true);
    });

    it('shows the sales entry only with a matching grant', () => {
        const withoutGrant = filterNavGroups(
            salesLinks as unknown as Parameters<typeof filterNavGroups>[0],
            ['/sales/orders'],
        );
        const withGrant = filterNavGroups(
            salesLinks as unknown as Parameters<typeof filterNavGroups>[0],
            [REVIEW_PATH],
        );

        expect(hrefsOf(withoutGrant)).not.toContain(REVIEW_PATH);
        expect(hrefsOf(withGrant)).toContain(REVIEW_PATH);
    });

    it('shows the finance entry only with a matching grant', () => {
        const withoutGrant = filterNavGroups(
            financeLinks as unknown as Parameters<typeof filterNavGroups>[0],
            ['/finance/journals'],
        );
        const withGrant = filterNavGroups(
            financeLinks as unknown as Parameters<typeof filterNavGroups>[0],
            [PAYMENT_PATH],
        );

        expect(hrefsOf(withoutGrant)).not.toContain(PAYMENT_PATH);
        expect(hrefsOf(withGrant)).toContain(PAYMENT_PATH);
    });
});
