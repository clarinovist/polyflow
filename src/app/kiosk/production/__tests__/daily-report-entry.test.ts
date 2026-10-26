import { describe, expect, it } from 'vitest';
import { productionOutputSchema, type ProductionOutputValues } from '@/lib/schemas/production';
import { toDailyReportPayload, type DailyReportOrder } from '../daily-report-entry';

const report: ProductionOutputValues = {
    productionOrderId: 'order-1',
    clientRequestId: '11111111-1111-4111-8111-111111111111',
    machineId: 'machine-1', operatorId: 'operator-1', helperIds: ['helper-1'], shiftId: 'shift-1',
    quantityProduced: 2.5, scrapQuantity: 0, scrapProngkolQty: 0, scrapDaunQty: 0,
    startTime: new Date('2026-10-26T00:00:00Z'), endTime: new Date('2026-10-26T01:00:00Z'),
    cekGram: undefined, notes: '',
};
const order = (config: Partial<NonNullable<NonNullable<DailyReportOrder['bom']>['productVariant']>> = {}): DailyReportOrder => ({
    id: 'order-1', orderNumber: 'SPK-TEST',
    bom: { productVariant: { name: 'Produk uji', primaryUnit: 'KG', salesUnit: 'BAL', conversionFactor: 12.5, ...config } },
});

describe('toDailyReportPayload', () => {
    it('converts sales units without rounding or mutating the entry, keeping HD fields and identity', () => {
        const hd = { ...report, bruto: 34, bobin: 2.75, cekGram: '12g', scrapProngkolQty: 1.2, scrapDaunQty: 0.3 };
        const before = structuredClone(hd);
        expect(toDailyReportPayload(hd, [order()])).toEqual({
            ...hd, quantityProduced: 31.25, enteredQuantity: 2.5, enteredUnit: 'BAL',
            baseQuantityProduced: 31.25, conversionFactorSnapshot: 12.5,
        });
        expect(hd).toEqual(before);
    });
    it('keeps Potong/Plong scrap separate from the converted netto', () => {
        expect(toDailyReportPayload({ ...report, scrapQuantity: 4 }, [order({ conversionFactor: '10' })]))
            .toMatchObject({ quantityProduced: 25, scrapQuantity: 4, clientRequestId: report.clientRequestId });
    });
    it.each([
        { orders: [] }, { orders: [order({ salesUnit: 'KG' })] },
        { orders: [order({ conversionFactor: 0 })] },
        { orders: [order({ conversionFactor: -1 })] },
        { orders: [{ id: 'order-1', orderNumber: 'SPK-TEST' }] },
    ])('preserves base-unit entries or absent/nonpositive conversion ($orders)', ({ orders }) => {
        expect(toDailyReportPayload(report, orders)).toBe(report);
    });
    it('preserves the existing factor-one fallback for an invalid factor', () => {
        expect(toDailyReportPayload(report, [order({ conversionFactor: 'invalid' })]))
            .toMatchObject({ quantityProduced: 2.5, enteredUnit: 'BAL', conversionFactorSnapshot: 1 });
    });
    it('does not introduce positive-only audit fields for affal-only output', () => {
        const affal = { ...report, quantityProduced: 0, scrapQuantity: 3 };
        const payload = toDailyReportPayload(affal, [order()]);
        expect(payload).toBe(affal);
        expect(payload).not.toHaveProperty('enteredQuantity');
        expect(productionOutputSchema.safeParse(payload).success).toBe(true);
    });
    it('leaves negative quantities for the existing validator to reject', () => {
        const invalid = { ...report, quantityProduced: -1 };
        expect(toDailyReportPayload(invalid, [order()])).toBe(invalid);
        expect(productionOutputSchema.safeParse(invalid).success).toBe(false);
    });
});
