import { describe, it, expect } from 'vitest';
import { getLogoForSubdomain } from '../config/company';

describe('getLogoForSubdomain', () => {
    it('returns melindo logo for melindo subdomain', () => {
        expect(getLogoForSubdomain('melindo')).toBe('/logos/melindo.png');
    });

    it('returns kiyowo logo for kiyowo subdomain', () => {
        expect(getLogoForSubdomain('kiyowo')).toBe('/logos/kiyowo.png');
    });

    it('returns null for unknown subdomain without env var', () => {
        delete process.env.COMPANY_LOGO_URL;
        expect(getLogoForSubdomain('unknown')).toBeNull();
    });

    it('falls back to env var for unknown subdomain', () => {
        process.env.COMPANY_LOGO_URL = '/logos/default.png';
        expect(getLogoForSubdomain('unknown')).toBe('/logos/default.png');
        delete process.env.COMPANY_LOGO_URL;
    });

    it('returns env var for null subdomain', () => {
        process.env.COMPANY_LOGO_URL = '/logos/fallback.png';
        expect(getLogoForSubdomain(null)).toBe('/logos/fallback.png');
        delete process.env.COMPANY_LOGO_URL;
    });
});

describe('getCompanyConfig', () => {
    it('returns config with all required fields', async () => {
        const { getCompanyConfig } = await import('../config/company');
        const config = getCompanyConfig();
        expect(config).toHaveProperty('name');
        expect(config).toHaveProperty('logoUrl');
        expect(config).toHaveProperty('address');
        expect(config).toHaveProperty('phone');
        expect(config).toHaveProperty('bankAccountsNonPPN');
        expect(config).toHaveProperty('bankAccountsPPN');
        expect(config).toHaveProperty('paperSize');
    });

    it('uses default company name when env not set', async () => {
        delete process.env.COMPANY_NAME;
        const { getCompanyConfig } = await import('../config/company');
        const config = getCompanyConfig();
        expect(config.name).toBe('CV MELINDO JAYA');
    });
});
