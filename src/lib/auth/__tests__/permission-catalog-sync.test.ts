import { describe, expect, it } from 'vitest';
import { flattenCatalog } from '../permission-catalog';
import { salesLinks } from '@/components/sales/sales-sidebar';
import { financeLinks } from '@/components/finance/finance-sidebar';

/** Recursively extract all hrefs from nav items (including children). */
function extractAllHrefs(
    groups: { items: { href: string; children?: { href: string }[] }[] }[],
): string[] {
    const hrefs: string[] = [];
    for (const group of groups) {
        for (const item of group.items) {
            hrefs.push(item.href);
            if (item.children) {
                for (const child of item.children) {
                    hrefs.push(child.href);
                }
            }
        }
    }
    return hrefs;
}

describe('permission-catalog-sync / sales sidebar', () => {
    it('every href in salesLinks has a matching key in permission catalog', () => {
        const catalogKeys = new Set(flattenCatalog().map((n) => n.key));

        const allHrefs = salesLinks.flatMap((g: { items: { href: string }[] }) =>
            g.items.map((item) => item.href),
        );

        const missing = allHrefs.filter((href: string) => !catalogKeys.has(href));

        expect(
            missing,
            `sidebar hrefs missing in PERMISSION_CATALOG: ${missing.join(', ')}`,
        ).toEqual([]);
    });

    it('catalog order reflects sidebar order: quotations before orders, team after customers', () => {
        const keys = flattenCatalog().map((n) => n.key);
        const quotationsIdx = keys.indexOf('/sales/quotations');
        const ordersIdx = keys.indexOf('/sales/orders');
        const customersIdx = keys.indexOf('/sales/customers');
        const teamIdx = keys.indexOf('/sales/team');

        expect(quotationsIdx).toBeGreaterThanOrEqual(0);
        expect(ordersIdx).toBeGreaterThanOrEqual(0);
        expect(customersIdx).toBeGreaterThanOrEqual(0);
        expect(teamIdx).toBeGreaterThanOrEqual(0);

        // plan req: quotations tepat sebelum orders; team setelah customers
        expect(quotationsIdx).toBeLessThan(ordersIdx);
        expect(customersIdx).toBeLessThan(teamIdx);
    });

    it('new sales hrefs are guarded by filterNavGroups (no ALL / no permission hides them)', async () => {
        const { filterNavGroups } = await import('../permission-match');

        const filteredWithout = filterNavGroups(
            salesLinks as unknown as Parameters<typeof filterNavGroups>[0],
            ['/sales/orders'],
        );
        const hrefsWithout = filteredWithout.flatMap((g: { items: { href: string }[] }) =>
            g.items.map((i) => i.href),
        );
        expect(hrefsWithout).not.toContain('/sales/routes');
        expect(hrefsWithout).not.toContain('/sales/team');
        expect(hrefsWithout).not.toContain('/sales/targets');
        expect(hrefsWithout).not.toContain('/sales/reports/commission');
        expect(hrefsWithout).not.toContain('/sales/quotations');
        expect(hrefsWithout).not.toContain('/sales/visits');
        expect(hrefsWithout).not.toContain('/sales/prospects');
        expect(hrefsWithout).not.toContain('/sales/price-list');
        expect(hrefsWithout).not.toContain('/sales/collection');

        const filteredWith = filterNavGroups(
            salesLinks as unknown as Parameters<typeof filterNavGroups>[0],
            ['/sales/quotations', '/sales/orders', '/sales/routes', '/sales/team', '/sales/targets', '/sales/reports/commission', '/sales/visits', '/sales/prospects', '/sales/price-list', '/sales/collection'],
        );
        const hrefsWith = filteredWith.flatMap((g: { items: { href: string }[] }) =>
            g.items.map((i) => i.href),
        );
        expect(hrefsWith).toContain('/sales/quotations');
        expect(hrefsWith).toContain('/sales/routes');
        expect(hrefsWith).toContain('/sales/team');
        expect(hrefsWith).toContain('/sales/targets');
        expect(hrefsWith).toContain('/sales/reports/commission');
        expect(hrefsWith).toContain('/sales/visits');
        expect(hrefsWith).toContain('/sales/prospects');
        expect(hrefsWith).toContain('/sales/price-list');
        expect(hrefsWith).toContain('/sales/collection');
    });

    it('new target and commission report hrefs exist in catalog and sidebar', () => {
        const catalogKeys = new Set(flattenCatalog().map((n) => n.key));
        expect(catalogKeys.has('/sales/targets')).toBe(true);
        expect(catalogKeys.has('/sales/reports/commission')).toBe(true);
        expect(catalogKeys.has('/sales/price-list')).toBe(true);
        expect(catalogKeys.has('/sales/collection')).toBe(true);

        const allHrefs = salesLinks.flatMap((g: { items: { href: string }[] }) =>
            g.items.map((item) => item.href),
        );
        expect(allHrefs).toContain('/sales/targets');
        expect(allHrefs).toContain('/sales/reports/commission');
        expect(allHrefs).toContain('/sales/price-list');
        expect(allHrefs).toContain('/sales/collection');
    });
});

describe('permission-catalog-sync / finance sidebar', () => {
    it('every href in financeLinks (including children) has a matching key in permission catalog', () => {
        const catalogKeys = new Set(flattenCatalog().map((n) => n.key));
        const allHrefs = extractAllHrefs(financeLinks);

        const missing = allHrefs.filter((href) => !catalogKeys.has(href));

        expect(
            missing,
            `finance sidebar hrefs missing in PERMISSION_CATALOG: ${missing.join(', ')}`,
        ).toEqual([]);
    });

    it('revenue-rules is a child of /finance/coa in catalog and in sidebar', () => {
        const catalogKeys = new Set(flattenCatalog().map((n) => n.key));
        expect(catalogKeys.has('/finance/coa')).toBe(true);
        expect(catalogKeys.has('/finance/coa/revenue-rules')).toBe(true);

        const allHrefs = extractAllHrefs(financeLinks);
        expect(allHrefs).toContain('/finance/coa/revenue-rules');
    });

    it('budgeting children are in catalog and sidebar', () => {
        const catalogKeys = new Set(flattenCatalog().map((n) => n.key));
        expect(catalogKeys.has('/finance/budgeting')).toBe(true);
        expect(catalogKeys.has('/finance/budgeting/input')).toBe(true);
        expect(catalogKeys.has('/finance/budgeting/variance')).toBe(true);

        const allHrefs = extractAllHrefs(financeLinks);
        expect(allHrefs).toContain('/finance/budgeting/input');
        expect(allHrefs).toContain('/finance/budgeting/variance');
    });

    it('petty-cash report children are in catalog and sidebar', () => {
        const catalogKeys = new Set(flattenCatalog().map((n) => n.key));
        expect(catalogKeys.has('/finance/petty-cash')).toBe(true);
        expect(catalogKeys.has('/finance/petty-cash/reports/daily')).toBe(true);
        expect(catalogKeys.has('/finance/petty-cash/reports/cash-opname')).toBe(true);
        expect(catalogKeys.has('/finance/petty-cash/reports/rekap')).toBe(true);

        const allHrefs = extractAllHrefs(financeLinks);
        expect(allHrefs).toContain('/finance/petty-cash/reports/daily');
        expect(allHrefs).toContain('/finance/petty-cash/reports/cash-opname');
        expect(allHrefs).toContain('/finance/petty-cash/reports/rekap');
    });

    it('no duplicate keys in finance catalog section', () => {
        const allKeys = flattenCatalog().map((n) => n.key);
        const seen = new Set<string>();
        const dupes: string[] = [];
        for (const k of allKeys) {
            if (seen.has(k)) dupes.push(k);
            seen.add(k);
        }
        expect(dupes, `duplicate catalog keys: ${dupes.join(', ')}`).toEqual([]);
    });

    it('parent grant covers children via filterNavGroups (hierarchical)', async () => {
        const { filterNavGroups } = await import('../permission-match');

        // User with /finance/budgeting parent grant should see budgeting + children
        const filtered = filterNavGroups(
            financeLinks as unknown as Parameters<typeof filterNavGroups>[0],
            ['/finance/budgeting'],
        );
        const hrefs = extractAllHrefs(filtered);
        expect(hrefs).toContain('/finance/budgeting');
        expect(hrefs).toContain('/finance/budgeting/input');
        expect(hrefs).toContain('/finance/budgeting/variance');
    });

    it('user without any finance permission sees no finance nav items', async () => {
        const { filterNavGroups } = await import('../permission-match');

        const filtered = filterNavGroups(
            financeLinks as unknown as Parameters<typeof filterNavGroups>[0],
            ['/sales/orders'],
        );
        const hrefs = extractAllHrefs(filtered);
        expect(hrefs).toEqual([]);
    });

    it('granular child grant without parent still shows child via filterNavGroups', async () => {
        const { filterNavGroups } = await import('../permission-match');

        // User with only /finance/budgeting/input (no parent) should see budgeting group
        // because parent /finance/budgeting is needed for the group to appear,
        // but the child should be visible if parent key is in catalog.
        // Actually: filterNavGroups checks canSeeNavHref per item.
        // /finance/budgeting has href="/finance/budgeting" — user has "/finance/budgeting/input"
        // canSeeNavHref: "/finance/budgeting/input".startsWith("/finance/budgeting/") → FALSE
        // But p.startsWith(`${href}/`) where p="/finance/budgeting/input", href="/finance/budgeting"
        // → "/finance/budgeting/input".startsWith("/finance/budgeting/") → TRUE, and href !== root
        // So parent IS visible if child is granted. The child itself: exact match.
        const filtered = filterNavGroups(
            financeLinks as unknown as Parameters<typeof filterNavGroups>[0],
            ['/finance/budgeting/input'],
        );
        const hrefs = extractAllHrefs(filtered);
        expect(hrefs).toContain('/finance/budgeting/input');
    });

    it('petty-cash parent grant covers report children', async () => {
        const { filterNavGroups } = await import('../permission-match');

        const filtered = filterNavGroups(
            financeLinks as unknown as Parameters<typeof filterNavGroups>[0],
            ['/finance/petty-cash'],
        );
        const hrefs = extractAllHrefs(filtered);
        expect(hrefs).toContain('/finance/petty-cash');
        expect(hrefs).toContain('/finance/petty-cash/reports/daily');
        expect(hrefs).toContain('/finance/petty-cash/reports/cash-opname');
        expect(hrefs).toContain('/finance/petty-cash/reports/rekap');
    });

    it('coa parent grant covers revenue-rules child', async () => {
        const { filterNavGroups } = await import('../permission-match');

        const filtered = filterNavGroups(
            financeLinks as unknown as Parameters<typeof filterNavGroups>[0],
            ['/finance/coa'],
        );
        const hrefs = extractAllHrefs(filtered);
        expect(hrefs).toContain('/finance/coa');
        expect(hrefs).toContain('/finance/coa/roles');
        expect(hrefs).toContain('/finance/coa/revenue-rules');
    });
});
