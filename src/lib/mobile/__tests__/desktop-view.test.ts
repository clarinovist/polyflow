import { describe, expect, it } from 'vitest';
import {
    buildDesktopViewClearCookie,
    buildDesktopViewCookie,
    DEFAULT_DESKTOP_VIEW_DAYS,
    desktopViewLabel,
    hasDesktopViewCookie,
    parseDesktopViewDays,
    safeDesktopTarget,
} from '../desktop-view';

describe('desktop view cookie', () => {
    it('sets the bypass cookie for the chosen number of days', () => {
        const cookie = buildDesktopViewCookie(7, false);

        expect(cookie).toContain('bypass_mobile=true');
        expect(cookie).toContain(`max-age=${7 * 86_400}`);
        expect(cookie).toContain('path=/');
        expect(cookie).toContain('SameSite=Lax');
        expect(cookie).not.toContain('Secure');
    });

    it('adds Secure on https', () => {
        expect(buildDesktopViewCookie(1, true)).toContain('Secure');
        expect(buildDesktopViewClearCookie(true)).toContain('Secure');
    });

    it('clears the cookie with max-age=0', () => {
        const cookie = buildDesktopViewClearCookie(false);

        expect(cookie).toContain('bypass_mobile=;');
        expect(cookie).toContain('max-age=0');
    });

    it('detects the bypass cookie among other cookies only on an exact match', () => {
        expect(hasDesktopViewCookie('a=1; bypass_mobile=true; b=2')).toBe(true);
        expect(hasDesktopViewCookie('bypass_mobile=false')).toBe(false);
        expect(hasDesktopViewCookie('x_bypass_mobile=true')).toBe(false);
        expect(hasDesktopViewCookie('')).toBe(false);
    });
});

describe('desktop view duration', () => {
    it('accepts the three supported durations', () => {
        expect(parseDesktopViewDays('7')).toBe(7);
        expect(parseDesktopViewDays(30)).toBe(30);
        expect(parseDesktopViewDays('1')).toBe(1);
    });

    it('falls back to 24 hours for unknown or missing values', () => {
        expect(parseDesktopViewDays('365')).toBe(DEFAULT_DESKTOP_VIEW_DAYS);
        expect(parseDesktopViewDays(null)).toBe(DEFAULT_DESKTOP_VIEW_DAYS);
        expect(parseDesktopViewDays('abc')).toBe(DEFAULT_DESKTOP_VIEW_DAYS);
    });

    it('labels durations for the UI', () => {
        expect(desktopViewLabel(1)).toBe('24 jam');
        expect(desktopViewLabel(7)).toBe('7 hari');
        expect(desktopViewLabel(30)).toBe('30 hari');
    });
});

describe('safeDesktopTarget', () => {
    it('keeps internal paths', () => {
        expect(safeDesktopTarget('/finance/reports?x=1')).toBe(
            '/finance/reports?x=1',
        );
    });

    it('rejects absolute and protocol-relative URLs', () => {
        expect(safeDesktopTarget('https://evil.example')).toBe('/dashboard');
        expect(safeDesktopTarget('//evil.example')).toBe('/dashboard');
        expect(safeDesktopTarget(null)).toBe('/dashboard');
    });
});
