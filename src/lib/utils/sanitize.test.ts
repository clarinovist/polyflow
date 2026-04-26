import { describe, expect, it } from 'vitest';

import { sanitizeHtml, sanitizeObject } from './sanitize';

describe('sanitizeHtml', () => {
    it('returns empty string for null input', () => {
        expect(sanitizeHtml(null)).toBe('');
    });

    it('returns empty string for undefined input', () => {
        expect(sanitizeHtml(undefined)).toBe('');
    });

    it('returns empty string for empty string', () => {
        expect(sanitizeHtml('')).toBe('');
    });

    it('passes plain text through unchanged', () => {
        expect(sanitizeHtml('Hello world')).toBe('Hello world');
    });

    it('strips <script> tags', () => {
        const input = 'Hello <script>alert("xss")</script> world';
        expect(sanitizeHtml(input)).toBe('Hello  world');
    });

    it('strips multi-line <script> tags', () => {
        const input = '<script>\nconst x = 1;\nalert(x);\n</script>text';
        expect(sanitizeHtml(input)).toBe('text');
    });

    it('strips <iframe> tags', () => {
        const input = 'before<iframe src="evil.com"></iframe>after';
        expect(sanitizeHtml(input)).toBe('beforeafter');
    });

    it('strips <object> tags', () => {
        const input = 'before<object data="evil.swf"></object>after';
        expect(sanitizeHtml(input)).toBe('beforeafter');
    });

    it('strips double-quoted event handlers', () => {
        const input = '<img src="x" onerror="alert(1)">';
        const result = sanitizeHtml(input);
        expect(result).not.toContain('onerror=');
    });

    it('strips single-quoted event handlers', () => {
        const input = "<img src='x' onload='alert(1)'>";
        const result = sanitizeHtml(input);
        expect(result).not.toContain('onload=');
    });

    it('strips javascript: protocol', () => {
        const input = '<a href=" javascript:alert(1)">click</a>';
        const result = sanitizeHtml(input);
        expect(result).not.toContain('javascript:');
    });

    it('preserves safe HTML tags', () => {
        const input = '<p>Hello <strong>world</strong></p>';
        expect(sanitizeHtml(input)).toBe('<p>Hello <strong>world</strong></p>');
    });
});

describe('sanitizeObject', () => {
    it('sanitizes string values in a flat object', () => {
        const input = { name: 'Alice', bio: '<script>xss()</script>safe' };
        const result = sanitizeObject(input);
        expect(result.bio).toBe('safe');
        expect(result.name).toBe('Alice');
    });

    it('leaves non-string values unchanged', () => {
        const input = { count: 42, active: true };
        const result = sanitizeObject(input);
        expect(result.count).toBe(42);
        expect(result.active).toBe(true);
    });

    it('recursively sanitizes nested objects', () => {
        const input = { outer: { inner: '<iframe src="x"></iframe>safe' } };
        const result = sanitizeObject(input);
        expect((result.outer as Record<string, unknown>).inner).toBe('safe');
    });

    it('sanitizes strings inside arrays', () => {
        const input = { tags: ['<script>bad()</script>ok', 'clean'] };
        const result = sanitizeObject(input);
        expect((result.tags as string[])[0]).toBe('ok');
        expect((result.tags as string[])[1]).toBe('clean');
    });

    it('handles empty object without error', () => {
        expect(() => sanitizeObject({})).not.toThrow();
    });
});
