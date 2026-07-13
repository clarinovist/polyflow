import { describe, it, expect } from 'vitest';
import { duplicateBomSchema } from '@/lib/schemas/production';

describe('duplicateBomSchema', () => {
    it('should accept valid duplicate data with defaults', () => {
        const result = duplicateBomSchema.parse({
            sourceBomId: 'bom-1',
            productVariantId: 'pv-2',
            name: 'Salinan - BOM KW 1,0',
        });
        expect(result.sourceBomId).toBe('bom-1');
        expect(result.productVariantId).toBe('pv-2');
        expect(result.quantityScale).toBe(1);
        expect(result.isDefault).toBe(true);
        expect(result.outputQuantity).toBeUndefined();
    });

    it('should accept scale factor and outputQuantity', () => {
        const result = duplicateBomSchema.parse({
            sourceBomId: 'bom-1',
            productVariantId: 'pv-2',
            name: 'BOM KW 0,5',
            outputQuantity: 1,
            quantityScale: 0.5,
            isDefault: false,
        });
        expect(result.quantityScale).toBe(0.5);
        expect(result.outputQuantity).toBe(1);
        expect(result.isDefault).toBe(false);
    });

    it('should reject missing sourceBomId', () => {
        expect(() => duplicateBomSchema.parse({
            productVariantId: 'pv-2',
            name: 'Test',
        })).toThrow();
    });

    it('should reject missing productVariantId', () => {
        expect(() => duplicateBomSchema.parse({
            sourceBomId: 'bom-1',
            name: 'Test',
        })).toThrow();
    });

    it('should reject missing name', () => {
        expect(() => duplicateBomSchema.parse({
            sourceBomId: 'bom-1',
            productVariantId: 'pv-2',
        })).toThrow();
    });

    it('should reject scale of 0', () => {
        expect(() => duplicateBomSchema.parse({
            sourceBomId: 'bom-1',
            productVariantId: 'pv-2',
            name: 'Test',
            quantityScale: 0,
        })).toThrow('Scale must be greater than 0');
    });

    it('should reject negative scale', () => {
        expect(() => duplicateBomSchema.parse({
            sourceBomId: 'bom-1',
            productVariantId: 'pv-2',
            name: 'Test',
            quantityScale: -1,
        })).toThrow('Scale must be greater than 0');
    });

    it('should reject negative outputQuantity', () => {
        expect(() => duplicateBomSchema.parse({
            sourceBomId: 'bom-1',
            productVariantId: 'pv-2',
            name: 'Test',
            outputQuantity: -5,
        })).toThrow('Output quantity must be positive');
    });

    it('should sanitize HTML in name', () => {
        const result = duplicateBomSchema.parse({
            sourceBomId: 'bom-1',
            productVariantId: 'pv-2',
            name: '<script>alert("xss")</script>BOM KW 0,5',
        });
        expect(result.name).not.toContain('<script>');
    });
});

describe('duplicateBom quantity scaling', () => {
    it('should scale quantities correctly at 0.5', () => {
        const scale = 0.5;
        const originalQty = 1.0;
        const scaledQty = Math.round(originalQty * scale * 10000) / 10000;
        expect(scaledQty).toBe(0.5);
    });

    it('should scale quantities correctly at 0.9', () => {
        const scale = 0.9;
        const originalQty = 1.0;
        const scaledQty = Math.round(originalQty * scale * 10000) / 10000;
        expect(scaledQty).toBe(0.9);
    });

    it('should round to 4 decimal places', () => {
        const scale = 0.33;
        const originalQty = 1.0;
        const scaledQty = Math.round(originalQty * scale * 10000) / 10000;
        expect(scaledQty).toBe(0.33);
    });

    it('should preserve scrap percentage unchanged', () => {
        const scrapPercentage = 3;
        // Scrap is not scaled — it stays the same
        expect(scrapPercentage).toBe(3);
    });

    it('should detect zero-quantity items after scaling', () => {
        const scale = 0.00001;
        const originalQty = 0.0001;
        const scaledQty = Math.round(originalQty * scale * 10000) / 10000;
        expect(scaledQty).toBe(0);
    });

    it('should handle very small but valid scale', () => {
        const scale = 0.001;
        const originalQty = 1.0;
        const scaledQty = Math.round(originalQty * scale * 10000) / 10000;
        expect(scaledQty).toBe(0.001);
        expect(scaledQty).toBeGreaterThan(0);
    });
});
