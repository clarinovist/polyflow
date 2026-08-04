import { describe, expect, it } from 'vitest';
import {
    computeMaterialPreview,
    resolveKioskMode,
} from '../rewinder-workflow';

describe('resolveKioskMode', () => {
    it('INDIVIDU_OUTPUT -> INDIVIDUAL_OUTPUT', () => {
        expect(resolveKioskMode('INDIVIDU_OUTPUT')).toBe('INDIVIDUAL_OUTPUT');
    });

    it('MATERIAL_CONVERSION -> MATERIAL_CONVERSION', () => {
        expect(resolveKioskMode('MATERIAL_CONVERSION')).toBe(
            'MATERIAL_CONVERSION',
        );
    });

    it('GENERIC -> GENERIC', () => {
        expect(resolveKioskMode('GENERIC')).toBe('GENERIC');
    });

    it('null -> GENERIC', () => {
        expect(resolveKioskMode(null)).toBe('GENERIC');
    });

    it('undefined -> GENERIC', () => {
        expect(resolveKioskMode(undefined)).toBe('GENERIC');
    });

    it('UNKNOWN_STRING -> GENERIC', () => {
        expect(resolveKioskMode('UNKNOWN_STRING')).toBe('GENERIC');
    });
});

describe('computeMaterialPreview', () => {
    it('(5, 1, 10, PCS) -> 50 PCS', () => {
        expect(computeMaterialPreview(5, 1, 10, 'PCS')).toEqual({
            requiredQty: 50,
            unit: 'PCS',
        });
    });

    it('(5, 1, 6, PCS) -> 30 PCS', () => {
        expect(computeMaterialPreview(5, 1, 6, 'PCS')).toEqual({
            requiredQty: 30,
            unit: 'PCS',
        });
    });

    it('(5, 0, 10, PCS) -> null', () => {
        expect(computeMaterialPreview(5, 0, 10, 'PCS')).toBeNull();
    });

    it('(5, 1, 0, PCS) -> null', () => {
        expect(computeMaterialPreview(5, 1, 0, 'PCS')).toBeNull();
    });

    it('(0, 1, 10, PCS) -> null', () => {
        expect(computeMaterialPreview(0, 1, 10, 'PCS')).toBeNull();
    });

    it('(-5, 1, 10, PCS) -> null', () => {
        expect(computeMaterialPreview(-5, 1, 10, 'PCS')).toBeNull();
    });

    it('(5, 1, -10, PCS) -> null', () => {
        expect(computeMaterialPreview(5, 1, -10, 'PCS')).toBeNull();
    });

    it('(NaN, 1, 10, PCS) -> null', () => {
        expect(computeMaterialPreview(NaN, 1, 10, 'PCS')).toBeNull();
    });
});
