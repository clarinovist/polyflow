import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
    return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('mobile navigation behavior', () => {
    it('uses normal links for portal destinations instead of replace navigation', () => {
        for (const path of [
            'src/components/mobile/MobilePortalBottomNav.tsx',
            'src/components/field/FieldBottomNav.tsx',
            'src/components/warehouse/mobile/WarehouseBottomNav.tsx',
        ]) {
            const content = source(path);
            expect(content).toContain("from 'next/link'");
            expect(content).not.toContain('router.replace(');
        }
    });

    it('keeps explicit form Back controls on browser history', () => {
        for (const path of [
            'src/components/warehouse/mobile/MobileWalkInReceiptForm.tsx',
            'src/components/warehouse/mobile/MobileWalkInDispatchForm.tsx',
        ]) {
            expect(source(path)).toContain('router.back()');
        }
    });

    it('marks desktop-only destinations explicitly', () => {
        for (const path of [
            'src/app/production/mobile/material-orders/page.tsx',
            'src/app/production/mobile/maintenance/page.tsx',
            'src/app/production/mobile/maintenance/new/form-client.tsx',
            'src/app/warehouse/mobile/incoming/[id]/page.tsx',
        ]) {
            expect(source(path)).toContain('/device/desktop-required?from=');
        }
    });
});
