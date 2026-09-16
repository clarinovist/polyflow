import { describe, expect, it, vi } from 'vitest';
import { flattenCatalog } from '../permission-catalog';
import { filterNavGroups } from '../permission-match';
import { NAV_REGISTRY } from '@/lib/navigation/registry';
import { productionLinks } from '@/components/production/production-sidebar';
import { OUTPUT_REPORT_PATH } from '@/lib/production/output-report';

vi.mock('@/components/layout/portal-sidebar-base', () => ({ PortalSidebarBase: () => null }));
vi.mock('@/components/layout/admin-back-button', () => ({ AdminBackButton: () => null }));

describe('production output report navigation', () => {
    it('registers the new permission/menu without replacing packing', () => {
        expect(flattenCatalog().some(n => n.key === OUTPUT_REPORT_PATH)).toBe(true);
        expect(NAV_REGISTRY.find(n => n.href === OUTPUT_REPORT_PATH)?.label).toBe('Rekap Hasil Produksi');
        expect(productionLinks.flatMap(g => g.items).some(i => i.href === '/production/packing-monthly')).toBe(true);
    });
    it.each([['/production/output-report'], ['/production'], 'ALL'] as const)('shows menu for granted resources %j', permissions => {
        const filtered = filterNavGroups(productionLinks, typeof permissions === 'string' ? permissions : [...permissions]);
        expect(filtered.flatMap(g => g.items).some(i => i.href === OUTPUT_REPORT_PATH)).toBe(true);
    });
    it('hides menu from packing-only and empty grants', () => {
        for (const resources of [[], ['/production/packing-monthly']]) {
            expect(filterNavGroups(productionLinks, resources).flatMap(g => g.items).some(i => i.href === OUTPUT_REPORT_PATH)).toBe(false);
        }
    });
});
