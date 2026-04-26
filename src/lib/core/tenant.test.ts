import { afterEach, describe, expect, it } from 'vitest';

import { extractSubdomain } from './tenant';

const ORIGINAL_ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN;

afterEach(() => {
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = ORIGINAL_ROOT_DOMAIN;
});

describe('extractSubdomain', () => {
    it('extracts subdomain from localhost host with port', () => {
        expect(extractSubdomain('tenant-a.localhost:3000')).toBe('tenant-a');
    });

    it('extracts subdomain from default production root domain', () => {
        delete process.env.NEXT_PUBLIC_ROOT_DOMAIN;
        expect(extractSubdomain('kiyowo.polyflow.uk')).toBe('kiyowo');
    });

    it('extracts subdomain from custom root domain', () => {
        process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'example.com';
        expect(extractSubdomain('tenant1.example.com')).toBe('tenant1');
    });

    it('returns null for root domain without subdomain', () => {
        delete process.env.NEXT_PUBLIC_ROOT_DOMAIN;
        expect(extractSubdomain('polyflow.uk')).toBeNull();
    });

    it('returns null for invalid host', () => {
        expect(extractSubdomain('localhost:3000')).toBeNull();
        expect(extractSubdomain('')).toBeNull();
    });
});
