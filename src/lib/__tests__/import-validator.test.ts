import { describe, it, expect } from 'vitest';
import { validateRow, validateImportRows, getValidationSummary, ValidationResult } from '../import-validator';
import { ProductType, Unit } from '@prisma/client';
import { ProductImportRow } from '../csv-parser';

describe('import-validator', () => {
    const validRow: ProductImportRow = {
        product_name: 'Test Product',
        product_type: 'RAW_MATERIAL',
        variant_name: 'Test Variant',
        sku_code: 'RMPPG001',
        primary_unit: 'KG',
        price: 100,
        min_stock_alert: 10,
        sales_unit: 'KG',
        conversion_factor: 1
    };

    describe('validateRow', () => {
        it('should validate a correct row', () => {
            const result = validateRow(validRow, 0, new Set(), new Set());
            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should return errors for missing required fields', () => {
            const invalidRow: ProductImportRow = {
                product_name: '',
                product_type: '',
                variant_name: '',
                sku_code: '',
                primary_unit: ''
            };
            const result = validateRow(invalidRow, 0, new Set(), new Set());
            expect(result.isValid).toBe(false);
            const errorFields = result.errors.map(e => e.field);
            expect(errorFields).toContain('product_name');
            expect(errorFields).toContain('product_type');
            expect(errorFields).toContain('variant_name');
            expect(errorFields).toContain('primary_unit');
        });

        it('should validate product_type enum', () => {
            const row = { ...validRow, product_type: 'INVALID_TYPE' };
            const result = validateRow(row, 0, new Set(), new Set());
            expect(result.isValid).toBe(false);
            expect(result.errors[0].field).toBe('product_type');
            expect(result.errors[0].message).toContain('Invalid product type');
        });

        it('should validate primary_unit enum', () => {
            const row = { ...validRow, primary_unit: 'INVALID_UNIT' };
            const result = validateRow(row, 0, new Set(), new Set());
            expect(result.isValid).toBe(false);
            expect(result.errors[0].field).toBe('primary_unit');
            expect(result.errors[0].message).toContain('Invalid unit');
        });

        it('should validate SKU format', () => {
            const row = { ...validRow, sku_code: 'INVALID' };
            const result = validateRow(row, 0, new Set(), new Set());
            expect(result.isValid).toBe(false);
            expect(result.errors[0].field).toBe('sku_code');
            expect(result.errors[0].message).toContain('Invalid SKU format');
        });

        it('should detect duplicate SKU in database', () => {
            const existingSKUs = new Set(['RMPPG001']);
            const result = validateRow(validRow, 0, existingSKUs, new Set());
            expect(result.isValid).toBe(false);
            expect(result.errors[0].message).toContain('already exists in database');
        });

        it('should detect duplicate SKU in file', () => {
            const fileSKUs = new Set(['RMPPG001']);
            const result = validateRow(validRow, 0, new Set(), fileSKUs);
            expect(result.isValid).toBe(false);
            expect(result.errors[0].message).toContain('Duplicate SKU RMPPG001 in import file');
        });

        it('should validate conversion_factor', () => {
            const invalidRows = [
                { ...validRow, conversion_factor: -1 },
                { ...validRow, conversion_factor: 0 },
                { ...validRow, conversion_factor: 'abc' as any }
            ];
            invalidRows.forEach(row => {
                const result = validateRow(row, 0, new Set(), new Set());
                expect(result.isValid).toBe(false);
                expect(result.errors.some(e => e.field === 'conversion_factor')).toBe(true);
            });
        });

        it('should validate numeric fields (price, min_stock_alert)', () => {
            const invalidRows = [
                { ...validRow, price: -1 },
                { ...validRow, price: 'abc' as any },
                { ...validRow, min_stock_alert: -5 },
                { ...validRow, min_stock_alert: 'abc' as any }
            ];
            invalidRows.forEach(row => {
                const result = validateRow(row, 0, new Set(), new Set());
                expect(result.isValid).toBe(false);
                expect(result.errors.some(e => ['price', 'min_stock_alert'].includes(e.field))).toBe(true);
            });
        });

        it('should generate warnings for missing optional fields', () => {
            const row: ProductImportRow = {
                product_name: 'Test',
                product_type: 'RAW_MATERIAL',
                variant_name: 'Test',
                sku_code: 'RMPPG001',
                primary_unit: 'KG'
            };
            const result = validateRow(row, 0, new Set(), new Set());
            expect(result.isValid).toBe(true);
            expect(result.warnings).toHaveLength(2);
            expect(result.warnings.map(w => w.field)).toContain('price');
            expect(result.warnings.map(w => w.field)).toContain('min_stock_alert');
        });
    });

    describe('validateImportRows', () => {
        it('should process multiple rows and detect internal duplicates', async () => {
            const rows: ProductImportRow[] = [
                { ...validRow, sku_code: 'RMPPG001' },
                { ...validRow, sku_code: 'RMPPG001' } // Duplicate in same file
            ];
            const results = await validateImportRows(rows, new Set());
            expect(results).toHaveLength(2);
            expect(results[0].isValid).toBe(true);
            expect(results[1].isValid).toBe(false);
            expect(results[1].errors[0].message).toContain('Duplicate SKU RMPPG001 in import file');
        });
    });

    describe('getValidationSummary', () => {
        it('should return correct summary counts', () => {
            const results: ValidationResult[] = [
                { row: 1, isValid: true, errors: [], warnings: [], data: validRow },
                { row: 2, isValid: false, errors: [{ field: 'test', message: 'error' }], warnings: [], data: validRow },
                { row: 3, isValid: true, errors: [], warnings: [{ field: 'test', message: 'warning' }], data: validRow }
            ];
            const summary = getValidationSummary(results);
            expect(summary).toEqual({
                total: 3,
                valid: 2,
                errors: 1,
                warnings: 1
            });
        });
    });
});
