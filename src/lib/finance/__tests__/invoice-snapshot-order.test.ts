import { describe, expect, it } from 'vitest';
import { invoiceSnapshotOrder } from '../invoice-snapshot';
import { snapshotFixture } from './invoice-snapshot-fixture';

describe('invoiceSnapshotOrder line order', () => {
    it('lists stored lines A–Z with natural numbers, matching the Surat Jalan order', () => {
        // Arrange: stored by internal id, so names arrive scrambled.
        const base = snapshotFixture().items[0];
        const items = [
            { ...base, sourceItemId: 'id-1', name: 'WARNA B 21' },
            { ...base, sourceItemId: 'id-2', name: 'WARNA A 15' },
            { ...base, sourceItemId: 'id-3', name: 'WARNA B 9' },
        ];
        const snapshot = snapshotFixture({
            items,
            taxAmount: '240.00',
            commercialTotal: '2660.00',
        });

        // Act
        const order = invoiceSnapshotOrder(snapshot);

        // Assert
        expect(order?.items.map((i) => i.productVariant.name)).toEqual([
            'WARNA A 15',
            'WARNA B 9',
            'WARNA B 21',
        ]);
        expect(order?.items.map((i) => i.id)).toEqual(['id-2', 'id-3', 'id-1']);
        expect(snapshot.items.map((i) => i.sourceItemId)).toEqual(['id-1', 'id-2', 'id-3']);
    });
});
