import { describe, expect, it } from 'vitest';
import { flattenCatalog } from '../permission-catalog';
import { salesLinks } from '@/components/sales/sales-sidebar';

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
