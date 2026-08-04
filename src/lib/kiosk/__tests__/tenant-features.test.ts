import { describe, it, expect } from 'vitest';
import {
    KIOSK_PROSES_KHUSUS_SETTING_KEY,
    isProsesKhususEnabled,
    parseKioskTenantFeatures,
} from '../tenant-features';

describe('kiosk tenant feature setting parser', () => {
    it('exposes the AppSetting key constant', () => {
        expect(KIOSK_PROSES_KHUSUS_SETTING_KEY).toBe(
            'kiosk.prosesKhususEnabled',
        );
    });

    it('parses explicit true string as enabled', () => {
        expect(isProsesKhususEnabled('true')).toBe(true);
    });

    it('parses explicit false string as disabled', () => {
        expect(isProsesKhususEnabled('false')).toBe(false);
    });

    it('fails closed on missing / null / empty values', () => {
        expect(isProsesKhususEnabled(null)).toBe(false);
        expect(isProsesKhususEnabled(undefined)).toBe(false);
        expect(isProsesKhususEnabled('')).toBe(false);
    });

    it('rejects malformed values', () => {
        expect(isProsesKhususEnabled('yes')).toBe(false);
        expect(isProsesKhususEnabled('TRUE')).toBe(false);
        expect(isProsesKhususEnabled('1')).toBe(false);
        expect(isProsesKhususEnabled('true ')).toBe(false);
    });

    it('parseKioskTenantFeatures returns a structured result', () => {
        expect(parseKioskTenantFeatures('true')).toEqual({
            hasProsesKhusus: true,
        });
        expect(parseKioskTenantFeatures('false')).toEqual({
            hasProsesKhusus: false,
        });
        expect(parseKioskTenantFeatures(null)).toEqual({
            hasProsesKhusus: false,
        });
        expect(parseKioskTenantFeatures('garbage')).toEqual({
            hasProsesKhusus: false,
        });
    });
});
