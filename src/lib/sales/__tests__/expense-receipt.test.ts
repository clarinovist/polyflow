import { describe, expect, it } from 'vitest';
import {
    buildExpenseReceiptObjectKey,
    expenseReceiptUrlPrefix,
    isOwnExpenseReceiptUrl,
    receiptExtensionForMime,
    resolveReceiptMime,
} from '../expense-receipt';

const TENANT = 'acme';
const USER = 'user-1';
const validUrl = `/api/images/${TENANT}/expense-receipt/${USER}/1700000000000.jpg`;

describe('resolveReceiptMime', () => {
    it.each([
        ['image/jpeg', 'a.bin', 'image/jpeg'],
        ['IMAGE/PNG', 'a.bin', 'image/png'],
        ['image/webp', 'a', 'image/webp'],
    ])('keeps allowed MIME %s', (mime, name, expected) => {
        expect(resolveReceiptMime(mime, name)).toBe(expected);
    });

    it('rejects HEIC/HEIF because the image proxy cannot serve them', () => {
        expect(resolveReceiptMime('image/heic', 'a.heic')).toBeNull();
        expect(resolveReceiptMime('image/heif', 'a.heif')).toBeNull();
        expect(resolveReceiptMime('', 'a.heic')).toBeNull();
    });

    it('rejects a disallowed MIME even when the filename looks like an image', () => {
        expect(resolveReceiptMime('image/gif', 'nota.jpg')).toBeNull();
        expect(resolveReceiptMime('application/pdf', 'nota.png')).toBeNull();
    });

    it('falls back to the filename extension when the MIME is empty', () => {
        expect(resolveReceiptMime('', 'screenshot.JPG')).toBe('image/jpeg');
        expect(resolveReceiptMime('', 'x.jpeg')).toBe('image/jpeg');
    });

    it('returns null for an empty MIME with an unknown or missing extension', () => {
        expect(resolveReceiptMime('', 'nota.exe')).toBeNull();
        expect(resolveReceiptMime('', 'nota')).toBeNull();
    });
});

describe('receiptExtensionForMime', () => {
    it('maps canonical MIME to a whitelisted extension and defaults to jpg', () => {
        expect(receiptExtensionForMime('image/png')).toBe('png');
        expect(receiptExtensionForMime('text/html')).toBe('jpg');
    });
});

describe('buildExpenseReceiptObjectKey', () => {
    it('builds {tenant}/expense-receipt/{userId}/{timestamp}.{ext}', () => {
        expect(buildExpenseReceiptObjectKey(TENANT, USER, 'png', 42)).toBe(
            'acme/expense-receipt/user-1/42.png',
        );
    });

    it('falls back to jpg for an extension outside the whitelist', () => {
        expect(buildExpenseReceiptObjectKey(TENANT, USER, 'php', 42)).toBe(
            'acme/expense-receipt/user-1/42.jpg',
        );
    });

    it('uses the current time when no timestamp is given', () => {
        expect(buildExpenseReceiptObjectKey(TENANT, USER, 'jpg')).toMatch(
            /^acme\/expense-receipt\/user-1\/\d+\.jpg$/,
        );
    });
});

describe('isOwnExpenseReceiptUrl', () => {
    it('accepts the URL the upload route returns for this tenant and user', () => {
        const key = buildExpenseReceiptObjectKey(TENANT, USER, 'webp', 1700000000000);
        expect(isOwnExpenseReceiptUrl(`/api/images/${key}`, TENANT, USER)).toBe(true);
        expect(validUrl.startsWith(expenseReceiptUrlPrefix(TENANT, USER))).toBe(true);
        expect(isOwnExpenseReceiptUrl(validUrl, TENANT, USER)).toBe(true);
    });

    it.each([
        ['another user', `/api/images/${TENANT}/expense-receipt/other/1700000000000.jpg`],
        ['another tenant', `/api/images/zzz/expense-receipt/${USER}/1700000000000.jpg`],
        ['another folder', `/api/images/${TENANT}/remittance-proof/${USER}/1700000000000.jpg`],
        ['absolute URL', `https://evil.example${validUrl}`],
        ['scheme-relative URL', `//evil.example${validUrl}`],
        ['traversal', `/api/images/${TENANT}/expense-receipt/${USER}/../other/1.jpg`],
        ['nested path', `/api/images/${TENANT}/expense-receipt/${USER}/a/1.jpg`],
        ['query string', `${validUrl}?x=1`],
        ['fragment', `${validUrl}#x`],
        ['encoded char', `/api/images/${TENANT}/expense-receipt/${USER}/1%2e.jpg`],
        ['disallowed extension', `/api/images/${TENANT}/expense-receipt/${USER}/1.php`],
        ['non-numeric name', `/api/images/${TENANT}/expense-receipt/${USER}/abc.jpg`],
        ['missing extension', `/api/images/${TENANT}/expense-receipt/${USER}/1700`],
        ['empty string', ''],
    ])('rejects %s', (_label, url) => {
        expect(isOwnExpenseReceiptUrl(url, TENANT, USER)).toBe(false);
    });

    it('rejects an unsafe tenant or user segment', () => {
        expect(isOwnExpenseReceiptUrl(validUrl, 'a/b', USER)).toBe(false);
        expect(isOwnExpenseReceiptUrl(validUrl, TENANT, '..')).toBe(false);
        expect(isOwnExpenseReceiptUrl(validUrl, TENANT, '')).toBe(false);
    });
});
