import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    DETECTOR_RESOURCES,
    detectorResources,
    isConditionDetector,
} from '../detector-catalog';

const APP_DIR = path.resolve(__dirname, '../../../app');

describe('DETECTOR_RESOURCES', () => {
    it.each(Object.entries(DETECTOR_RESOURCES))(
        '%s only references app routes that exist',
        (_detector, resources) => {
            for (const resource of resources) {
                expect(existsSync(path.join(APP_DIR, resource))).toBe(true);
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
