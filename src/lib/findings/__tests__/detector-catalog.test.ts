import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    DETECTOR_RESOURCES,
    detectorResources,
    isConditionDetector,
} from '../detector-catalog';

const APP_DIR = path.resolve(__dirname, '../../../app');

// A permission resource is usable when it renders something itself or owns a
// child page reachable through prefix grants (e.g. /finance/invoices).
function isPermissionRoute(resource: string): boolean {
    const dir = path.join(APP_DIR, resource);
    if (!existsSync(dir)) return false;
    if (
        ['page.tsx', 'layout.tsx', 'route.ts'].some((file) =>
            existsSync(path.join(dir, file)),
        )
    ) {
        return true;
    }
    return readdirSync(dir, { withFileTypes: true }).some(
        (entry) =>
            entry.isDirectory() &&
            existsSync(path.join(dir, entry.name, 'page.tsx')),
    );
}

describe('DETECTOR_RESOURCES', () => {
    it.each(Object.entries(DETECTOR_RESOURCES))(
        '%s only references permission resources that render',
        (_detector, resources) => {
            for (const resource of resources) {
                expect(isPermissionRoute(resource)).toBe(true);
            }
        },
    );

    it('routes overdue AR to the sales invoice page, not only finance', () => {
        expect(detectorResources('overdue_ar')).toContain('/sales/invoices');
    });

    it('returns a fresh copy so callers cannot mutate the catalog', () => {
        const copy = detectorResources('critical_stock');
        copy.push('/tampered');
        expect(DETECTOR_RESOURCES.critical_stock).toEqual([
            '/warehouse/inventory',
        ]);
    });
});

describe('isConditionDetector', () => {
    it('treats every catalogued detector as a condition detector', () => {
        for (const detector of Object.keys(DETECTOR_RESOURCES)) {
            expect(isConditionDetector(detector)).toBe(true);
        }
    });

    it('returns false for an unknown detector', () => {
        expect(isConditionDetector('manual_review')).toBe(false);
    });
});
