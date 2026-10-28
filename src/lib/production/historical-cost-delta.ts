import { Prisma } from '@prisma/client';
import { BusinessRuleError } from '../errors/errors';

/** Read-only calculation, NOT an authorization, posting vector or apply payload.
 * Caller must independently prove the opening snapshot and complete processing
 * chronology. Document dates are not stock processing timestamps. */
export type HistoricalCostEvent = {
    id: string;
    processedAt: string;
    quantity: string;
} & (
    | {
          kind: 'output';
          originalUnitCost: string;
          originalJournalValue: string;
          correctedJournalValue: string;
      }
    | { kind: 'shipment'; originalJournalValue: string }
);
export interface HistoricalCostDeltaInput {
    opening: { quantity: string; averageCost: string };
    observedEnding: { quantity: string; averageCost: string };
    /** Explicit processing order; ambiguous, duplicate or decreasing times reject. */
    events: HistoricalCostEvent[];
}

function fail(reason: string): never {
    throw new BusinessRuleError(
        `Preview biaya historis ditolak: ${reason}.`,
        undefined,
        'HISTORICAL_COST_PREVIEW_INVALID',
    );
}
const d = (value: string, scale: number, positive = false): Prisma.Decimal => {
    if (!/^\d+(?:\.\d+)?$/.test(value)) fail('nilai harus desimal nonnegatif');
    const result = new Prisma.Decimal(value);
    if (
        !result.isFinite() ||
        result.decimalPlaces() > scale ||
        (positive && !result.gt(0))
    )
        fail('presisi atau jumlah tidak valid');
    return result;
};
const round = (value: Prisma.Decimal, places: number) =>
    value.toDecimalPlaces(places, Prisma.Decimal.ROUND_HALF_UP);
const cents = (value: Prisma.Decimal) => round(value, 2);
const zero = () => new Prisma.Decimal(0);

/**
 * Replay the original and target-corrected WAC side by side. Shipment COGS is
 * changed ONLY by the target's WAC delta, never replaced by the full corrected
 * WAC: pre-existing standard-price-vs-WAC discrepancies remain untouched.
 * Exposes (rather than hides) sub-rupiah WAC/ledger rounding differences.
 */
export function previewHistoricalCostDelta(input: HistoricalCostDeltaInput) {
    if (!input.events.length || input.events.length > 1000)
        fail('jumlah peristiwa di luar batas');
    let quantity = d(input.opening.quantity, 4);
    let originalAverage = d(input.opening.averageCost, 4);
    let correctedAverage = originalAverage;
    let outputDelta = zero(),
        cogsDelta = zero();
    let previousTime = -Infinity;
    const ids = new Set<string>();
    const outputs: Array<{
        id: string;
        quantity: string;
        originalValue: string;
        correctedValue: string;
        delta: string;
        correctedUnitCost: string;
    }> = [];
    const shipments: Array<{
        id: string;
        quantity: string;
        originalPostedCogs: string;
        originalReplayCogs: string;
        baselineGapPreserved: string;
        targetDelta: string;
        proposedPostedCogs: string;
    }> = [];
    for (const event of input.events) {
        const time = Date.parse(event.processedAt);
        if (
            !event.id ||
            ids.has(event.id) ||
            !/(Z|[+-]\d{2}:\d{2})$/.test(event.processedAt) ||
            !Number.isFinite(time) ||
            time <= previousTime
        )
            fail('urutan pemrosesan tidak unik atau tidak terbukti');
        ids.add(event.id);
        previousTime = time;
        const qty = d(event.quantity, 4, true);
        const oldJournal = d(event.originalJournalValue, 2);
        if (event.kind === 'output') {
            const oldUnit = d(event.originalUnitCost, 4);
            // Journal cents and persisted 4dp unit cost need not multiply back
            // exactly, but any difference must fit their maximum rounding bound.
            const tolerance = qty.mul('0.00005').plus('0.005');
            if (qty.mul(oldUnit).minus(oldJournal).abs().gt(tolerance))
                fail('harga hasil tidak cocok dengan jurnal asal');
            const newJournal = d(event.correctedJournalValue, 2);
            const newUnit = round(newJournal.div(qty), 4);
            const nextQuantity = quantity.plus(qty);
            originalAverage = round(
                quantity
                    .mul(originalAverage)
                    .plus(qty.mul(oldUnit))
                    .div(nextQuantity),
                4,
            );
            correctedAverage = round(
                quantity
                    .mul(correctedAverage)
                    .plus(qty.mul(newUnit))
                    .div(nextQuantity),
                4,
            );
            quantity = nextQuantity;
            const delta = newJournal.minus(oldJournal);
            outputDelta = outputDelta.plus(delta);
            outputs.push({
                id: event.id,
                quantity: qty.toString(),
                originalValue: oldJournal.toFixed(2),
                correctedValue: newJournal.toFixed(2),
                delta: delta.toFixed(2),
                correctedUnitCost: newUnit.toFixed(4),
            });
        } else if (event.kind === 'shipment') {
            if (quantity.lt(qty)) fail('stok historis tidak cukup');
            const replayCogs = cents(qty.mul(originalAverage));
            const delta = cents(
                qty.mul(correctedAverage.minus(originalAverage)),
            );
            const proposedCogs = oldJournal.plus(delta);
            if (proposedCogs.lt(0)) fail('HPP hasil koreksi negatif');
            cogsDelta = cogsDelta.plus(delta);
            quantity = quantity.minus(qty);
            shipments.push({
                id: event.id,
                quantity: qty.toString(),
                originalPostedCogs: oldJournal.toFixed(2),
                originalReplayCogs: replayCogs.toFixed(2),
                baselineGapPreserved: replayCogs.minus(oldJournal).toFixed(2),
                targetDelta: delta.toFixed(2),
                proposedPostedCogs: proposedCogs.toFixed(2),
            });
        } else fail('jenis peristiwa belum didukung');
    }
    const observedQty = d(input.observedEnding.quantity, 4);
    const observedAverage = d(input.observedEnding.averageCost, 4);
    if (!quantity.eq(observedQty) || !originalAverage.eq(observedAverage))
        fail('replay asal tidak sama dengan snapshot persediaan terkini');
    if (!outputs.length) fail('tidak ada hasil produksi dalam cakupan');
    const retainedLedgerDelta = outputDelta.minus(cogsDelta);
    const replayInventoryDelta = cents(
        quantity.mul(correctedAverage.minus(originalAverage)),
    );
    return {
        mode: 'TARGET_DELTA_ONLY' as const,
        executable: false as const,
        outputs,
        shipments,
        totalOutputDelta: outputDelta.toFixed(2),
        totalCogsDelta: cogsDelta.toFixed(2),
        retainedLedgerDelta: retainedLedgerDelta.toFixed(2),
        endingQuantity: quantity.toString(),
        originalEndingAverage: originalAverage.toFixed(4),
        correctedEndingAverage: correctedAverage.toFixed(4),
        replayInventoryDelta: replayInventoryDelta.toFixed(2),
        roundingDifference: retainedLedgerDelta
            .minus(replayInventoryDelta)
            .toFixed(2),
        warning:
            'Preview saja. Atribusi sumber, dampak affal, akun, periode, pembulatan dan mekanisme koreksi belum disahkan oleh replay ini.',
    };
}
