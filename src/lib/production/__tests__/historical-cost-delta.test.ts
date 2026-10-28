import { describe, expect, it } from 'vitest';
import { previewHistoricalCostDelta, type HistoricalCostDeltaInput } from '../historical-cost-delta';

const input = (): HistoricalCostDeltaInput => ({
    opening: { quantity: '100', averageCost: '10' }, observedEnding: { quantity: '130', averageCost: '10' },
    events: [
        { id: 'batch-a', kind: 'output', processedAt: '2026-01-01T01:00:00Z', quantity: '100', originalUnitCost: '10', originalJournalValue: '1000', correctedJournalValue: '1200' },
        { id: 'shipment-a', kind: 'shipment', processedAt: '2026-01-01T02:00:00Z', quantity: '50', originalJournalValue: '400' },
        { id: 'batch-b', kind: 'output', processedAt: '2026-01-01T03:00:00Z', quantity: '50', originalUnitCost: '10', originalJournalValue: '500', correctedJournalValue: '600' },
        { id: 'shipment-b', kind: 'shipment', processedAt: '2026-01-01T04:00:00Z', quantity: '70', originalJournalValue: '560' },
    ],
});
describe('target-only historic output cost preview', () => {
    it('preserves pre-existing COGS mismatch instead of replacing HPP by WAC', () => {
        const result = previewHistoricalCostDelta(input());
        expect(result).toMatchObject({ executable: false, mode: 'TARGET_DELTA_ONLY', totalOutputDelta: '300.00', totalCogsDelta: '137.50', retainedLedgerDelta: '162.50', replayInventoryDelta: '162.50', roundingDifference: '0.00', correctedEndingAverage: '11.2500', endingQuantity: '130' });
        expect(result.shipments).toEqual([
            { id: 'shipment-a', quantity: '50', originalPostedCogs: '400.00', originalReplayCogs: '500.00', baselineGapPreserved: '100.00', targetDelta: '50.00', proposedPostedCogs: '450.00' },
            { id: 'shipment-b', quantity: '70', originalPostedCogs: '560.00', originalReplayCogs: '700.00', baselineGapPreserved: '140.00', targetDelta: '87.50', proposedPostedCogs: '647.50' },
        ]);
    });
    it('supports a negative target delta without altering quantities or unrelated baseline', () => {
        const data = input();
        for (const e of data.events) if (e.kind === 'output') e.correctedJournalValue = e.id === 'batch-a' ? '800' : '400';
        expect(previewHistoricalCostDelta(data)).toMatchObject({ totalOutputDelta: '-300.00', totalCogsDelta: '-137.50', retainedLedgerDelta: '-162.50', endingQuantity: '130' });
    });
    it.each(['ending qty', 'ending WAC', 'duplicate id', 'equal timestamp', 'reordered', 'timezone', 'negative quantity', 'precision', 'NaN', 'source mismatch', 'negative stock'])('rejects %s', kind => {
        const data = input();
        if (kind === 'ending qty') data.observedEnding.quantity = '129';
        if (kind === 'ending WAC') data.observedEnding.averageCost = '9';
        if (kind === 'duplicate id') data.events[1].id = data.events[0].id;
        if (kind === 'equal timestamp') data.events[1].processedAt = data.events[0].processedAt;
        if (kind === 'reordered') data.events.reverse();
        if (kind === 'timezone') data.events[0].processedAt = '2026-01-01T01:00:00';
        if (kind === 'negative quantity') data.events[0].quantity = '-1';
        if (kind === 'precision') data.opening.averageCost = '10.00001';
        if (kind === 'NaN') data.opening.averageCost = 'NaN';
        if (kind === 'source mismatch') data.events[0].originalJournalValue = '999';
        if (kind === 'negative stock') data.events[1].quantity = '201';
        expect(() => previewHistoricalCostDelta(data)).toThrow();
    });
    it('exposes rounding instead of silently adding a balancing entry', () => {
        const data: HistoricalCostDeltaInput = { opening: { quantity: '1000', averageCost: '0' }, observedEnding: { quantity: '1001', averageCost: '0' }, events: [{ id: 'output', kind: 'output', processedAt: '2026-01-01T00:00:00Z', quantity: '1', originalUnitCost: '0', originalJournalValue: '0', correctedJournalValue: '0.01' }] };
        const result = previewHistoricalCostDelta(data);
        expect(result.totalOutputDelta).toBe('0.01'); expect(result.executable).toBe(false);
        expect(result.roundingDifference).toBe('0.01'); expect(result.replayInventoryDelta).toBe('0.00');
    });
    it('does not mutate caller evidence', () => {
        const data = input(); const before = JSON.stringify(data);
        previewHistoricalCostDelta(data);
        expect(JSON.stringify(data)).toBe(before);
    });
    it('rejects a target decrease that would make already-posted COGS negative', () => {
        const data = input(); data.events[1].originalJournalValue = '0';
        if (data.events[0].kind === 'output') data.events[0].correctedJournalValue = '0';
        expect(() => previewHistoricalCostDelta(data)).toThrow('HPP');
    });
    it('rejects missing or excessive history', () => {
        const data = input(); data.events = [];
        expect(() => previewHistoricalCostDelta(data)).toThrow();
        data.events = Array(1001).fill(input().events[0]);
        expect(() => previewHistoricalCostDelta(data)).toThrow();
    });
});
