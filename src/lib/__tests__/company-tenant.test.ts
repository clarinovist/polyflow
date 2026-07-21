import { describe, it, expect, beforeEach } from 'vitest';
import { getLogoForSubdomain } from '../config/company';

describe('getLogoForSubdomain', () => {
    beforeEach(() => {
        delete process.env.COMPANY_LOGO_URL;
    });

    it('returns null for unknown subdomain without env var (generic fallback)', () => {
        expect(getLogoForSubdomain('unknown')).toBeNull();
    });

    it('falls back to env var for any subdomain when set', () => {
        process.env.COMPANY_LOGO_URL = '/logos/default.png';
        expect(getLogoForSubdomain('any-tenant')).toBe('/logos/default.png');
    });

    it('returns env var for null subdomain', () => {
        process.env.COMPANY_LOGO_URL = '/logos/fallback.png';
        expect(getLogoForSubdomain(null)).toBe('/logos/fallback.png');
    });

    it('returns null for tenant-specific hardcoded names — no LOGO_MAP', () => {
        // Previously returned /logos/melindo.png; now must be null without env
        expect(getLogoForSubdomain('melindo')).toBeNull();
        expect(getLogoForSubdomain('kiyowo')).toBeNull();
    });
});

describe('getCompanyConfig', () => {
    it('returns config with all required fields and no tenant leaks', async () => {
        delete process.env.COMPANY_NAME;
        delete process.env.COMPANY_ADDRESS;
        delete process.env.COMPANY_EMAIL;
        const { getCompanyConfig } = await import('../config/company');
        const config = getCompanyConfig();
        expect(config).toHaveProperty('name');
        expect(config).toHaveProperty('logoUrl');
        expect(config).toHaveProperty('address');
        expect(config).toHaveProperty('phone');
        expect(config).toHaveProperty('bankAccountsNonPPN');
        expect(config).toHaveProperty('bankAccountsPPN');
        expect(config).toHaveProperty('paperSize');
        // generic fallback, not tenant-specific
        expect(config.name).toBe('');
        expect(config.bankAccountsNonPPN).toEqual([]);
        expect(config.bankAccountsPPN).toEqual([]);
    });

    it('uses env vars when set', async () => {
        process.env.COMPANY_NAME = 'PT Test';
        process.env.COMPANY_ADDRESS = 'Jl Test';
        const { getCompanyConfig } = await import('../config/company');
        const config = getCompanyConfig();
        expect(config.name).toBe('PT Test');
        expect(config.address).toBe('Jl Test');
        delete process.env.COMPANY_NAME;
        delete process.env.COMPANY_ADDRESS;
    });

    it('does not leak personal data in fallback', async () => {
        delete process.env.COMPANY_NAME;
        delete process.env.COMPANY_SIGNER_NAME;
        delete process.env.BANK_ACCOUNTS_NON_PPN;
        delete process.env.BANK_ACCOUNTS_PPN;
        const { getCompanyConfig } = await import('../config/company');
        const config = getCompanyConfig();
        const dumped = JSON.stringify(config);
        expect(dumped).not.toContain('MELINDO');
        expect(dumped).not.toContain('Nugroho');
        expect(dumped).not.toContain('jaya.melindo');
        expect(dumped).not.toContain('7735006002');
    });
});
