import { describe, it, expect } from 'vitest';
import { parseBundleDocs, MAX_BUNDLE_DOCS } from '../escp-bundle';

describe('parseBundleDocs', () => {
    it('parses delivery and invoice refs in the order given', () => {
        // Arrange
        const raw = ['delivery:do-1', 'invoice:inv-1'];

        // Act
        const result = parseBundleDocs(raw);

        // Assert — order matters: the UI sends surat jalan first
        expect(result.error).toBeNull();
        expect(result.docs).toEqual([
            { type: 'delivery', id: 'do-1' },
            { type: 'invoice', id: 'inv-1' },
        ]);
    });

    it('accepts uuid-style ids with dashes', () => {
        // Arrange
        const raw = ['invoice:8f14e45f-ceea-467a-9e6f-2b1c3d4e5f60'];

        // Act
        const result = parseBundleDocs(raw);

        // Assert
        expect(result.error).toBeNull();
        expect(result.docs[0].id).toBe('8f14e45f-ceea-467a-9e6f-2b1c3d4e5f60');
    });

    it('returns an error when no doc is given', () => {
        // Act
        const result = parseBundleDocs([]);

        // Assert
        expect(result.docs).toEqual([]);
        expect(result.error).toContain('Missing doc parameter');
    });

    it('rejects an unknown document type', () => {
        // Act
        const result = parseBundleDocs(['payslip:emp-1']);

        // Assert
        expect(result.docs).toEqual([]);
        expect(result.error).toContain('Invalid doc');
    });

    it('rejects a ref without a type prefix', () => {
        // Act
        const result = parseBundleDocs(['do-1']);

        // Assert
        expect(result.error).toContain('Invalid doc');
    });

    it('rejects an empty id', () => {
        // Act
        const result = parseBundleDocs(['delivery:']);

        // Assert
        expect(result.error).toContain('Invalid doc');
    });

    it('caps the number of documents per request', () => {
        // Arrange — one past the ceiling
        const raw = Array.from(
            { length: MAX_BUNDLE_DOCS + 1 },
            (_, i) => `delivery:do-${i}`,
        );

        // Act
        const result = parseBundleDocs(raw);

        // Assert
        expect(result.docs).toEqual([]);
        expect(result.error).toContain('Too many documents');
    });

    it('allows exactly the maximum', () => {
        // Arrange
        const raw = Array.from(
            { length: MAX_BUNDLE_DOCS },
            (_, i) => `delivery:do-${i}`,
        );

        // Act
        const result = parseBundleDocs(raw);

        // Assert
        expect(result.error).toBeNull();
        expect(result.docs).toHaveLength(MAX_BUNDLE_DOCS);
    });
});
