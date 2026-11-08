import { describe, expect, it } from 'vitest';
import { toFindingViews, type SerializedFindingRow } from '../finding-view';

function row(overrides: Partial<SerializedFindingRow> = {}): SerializedFindingRow {
    return {
        id: 'f1',
        fingerprint: 'overdue_ar:i1',
        detector: 'overdue_ar',
        severity: 'CRITICAL',
        status: 'CLAIMED',
        headline: 'h',
        firstSeenAt: '2026-11-01T00:00:00.000Z',
        claimedById: 'u1',
        claimedBy: { name: 'Sinta', email: 'sinta@example.test' },
        ...overrides,
    };
}

describe('toFindingViews', () => {
    it('keeps the claimer name but never the email', () => {
        const [view] = toFindingViews([row()]);

        expect(view.claimedByName).toBe('Sinta');
        expect(JSON.stringify(view)).not.toContain('example.test');
    });

    it('fills missing optional fields with null', () => {
        const [view] = toFindingViews([row({ claimedBy: undefined, claimedById: undefined })]);

        expect(view.detail).toBeNull();
        expect(view.entityId).toBeNull();
        expect(view.slaDueAt).toBeNull();
        expect(view.claimedByName).toBeNull();
    });

    it('drops resolved rows', () => {
        expect(toFindingViews([row({ status: 'RESOLVED' })])).toEqual([]);
    });
});
