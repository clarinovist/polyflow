import { describe, it, expect } from 'vitest';
import { BusinessRuleError } from '@/lib/errors/errors';
import { assertSafeDocumentUrl, isSafeDocumentUrl } from '../document-url';

describe('isSafeDocumentUrl', () => {
    it.each([
        ['internal image proxy path', '/api/images/acme/hrd-docs/loan/doc-1/1.jpg'],
        ['https url', 'https://files.example.com/doc.pdf'],
    ])('accepts %s', (_label, url) => {
        expect(isSafeDocumentUrl(url)).toBe(true);
    });

    it.each([
        ['javascript scheme', 'javascript:alert(1)'],
        ['data scheme', 'data:text/html;base64,PHNjcmlwdD4='],
        ['protocol-relative url', '//evil.example.com/x.jpg'],
        ['plain http', 'http://files.example.com/doc.pdf'],
        ['path traversal', '/api/images/acme/../globex/a.jpg'],
        ['encoded path traversal', '/api/images/acme/%2e%2e/globex/a.jpg'],
        ['double slash inside path', '/api/images//acme/a.jpg'],
        ['other internal path', '/admin/secret'],
        ['control character', '/api/images/acme/a.jpg\n'],
        ['backslash', '/api/images/acme\\a.jpg'],
        ['https with credentials', 'https://user:pw@files.example.com/a.pdf'],
        ['https without host', 'https://'],
        ['empty string', ''],
    ])('rejects %s', (_label, url) => {
        expect(isSafeDocumentUrl(url)).toBe(false);
    });
});

describe('assertSafeDocumentUrl', () => {
    it('does nothing for an absent url', () => {
        expect(() => assertSafeDocumentUrl(undefined)).not.toThrow();
        expect(() => assertSafeDocumentUrl(null)).not.toThrow();
        expect(() => assertSafeDocumentUrl('')).not.toThrow();
    });

    it('does nothing for a safe url', () => {
        expect(() =>
            assertSafeDocumentUrl('/api/images/acme/hrd-docs/loan/d/1.jpg'),
        ).not.toThrow();
    });

    it('throws BusinessRuleError with an Indonesian message for an unsafe url', () => {
        expect(() => assertSafeDocumentUrl('javascript:alert(1)')).toThrow(
            BusinessRuleError,
        );
        expect(() => assertSafeDocumentUrl('javascript:alert(1)')).toThrow(
            /tautan dokumen/i,
        );
    });
});
