import { describe, expect, it } from 'vitest';
import {
    documentLineName,
    sortByDocumentLineName,
} from '../document-line-order';

const line = (name: string | null, productName = 'Produk') => ({
    productVariant: { name, product: { name: productName } },
});

describe('sortByDocumentLineName', () => {
    it('orders names A–Z with numbers in natural order', () => {
        // Arrange
        const names = ['WARNA B 21', 'WARNA A 15', 'WARNA B 9', 'warna a 2', 'WARNA A 28'];

        // Act
        const sorted = sortByDocumentLineName(names, (n) => n);

        // Assert
        expect(sorted).toEqual(['warna a 2', 'WARNA A 15', 'WARNA A 28', 'WARNA B 9', 'WARNA B 21']);
    });

    it('returns a new array and keeps input order for equal names', () => {
        const items = [
            { id: 'second', name: 'Sama' },
            { id: 'first', name: 'Awal' },
            { id: 'third', name: 'Sama' },
        ];

        const sorted = sortByDocumentLineName(items, (i) => i.name);

        expect(sorted.map((i) => i.id)).toEqual(['first', 'second', 'third']);
        expect(items.map((i) => i.id)).toEqual(['second', 'first', 'third']);
    });

    it('sorts missing names first instead of throwing', () => {
        const sorted = sortByDocumentLineName(['B', null, 'A'], (n) => n);

        expect(sorted).toEqual([null, 'A', 'B']);
    });
});

describe('documentLineName', () => {
    it('prefers the variant name, then the product name', () => {
        expect(documentLineName(line('Varian 1'))).toBe('Varian 1');
        expect(documentLineName(line(null, 'Produk Induk'))).toBe('Produk Induk');
        expect(documentLineName({})).toBe('');
    });
});
