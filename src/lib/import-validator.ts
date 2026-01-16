import { ProductType, Unit } from '@prisma/client';
import { ProductImportRow } from './csv-parser';

export interface ValidationError {
    field: string;
    message: string;
}

export interface ValidationResult {
    row: number;
    isValid: boolean;
    errors: ValidationError[];
    warnings: ValidationError[];
    data: ProductImportRow;
}

const SKU_PATTERN = /^(RM|IN|PK|WP|FG|SC)[A-Z]{3}\d{3}$/;

const VALID_PRODUCT_TYPES = Object.values(ProductType);
const VALID_UNITS = Object.values(Unit);

/**
 * Validate a single import row
 */
export function validateRow(
    row: ProductImportRow,
    rowIndex: number,
    existingSKUs: Set<string>,
    fileSKUs: Set<string>
): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // Required fields
    if (!row.product_name?.trim()) {
        errors.push({ field: 'product_name', message: 'Product name is required' });
    }

    if (!row.product_type?.trim()) {
        errors.push({ field: 'product_type', message: 'Product type is required' });
    } else if (!VALID_PRODUCT_TYPES.includes(row.product_type as ProductType)) {
        errors.push({
            field: 'product_type',
            message: `Invalid product type. Must be one of: ${VALID_PRODUCT_TYPES.join(', ')}`
        });
    }

    if (!row.variant_name?.trim()) {
        errors.push({ field: 'variant_name', message: 'Variant name is required' });
    }

    if (row.sku_code?.trim()) {
        const sku = row.sku_code.trim().toUpperCase();

        // Check format
        if (!SKU_PATTERN.test(sku)) {
            errors.push({
                field: 'sku_code',
                message: 'Invalid SKU format. Must be 8 characters: [TYPE][CATEGORY][SEQ] (e.g., RMPPG001)'
            });
        }

        // Check for duplicates in database
        if (existingSKUs.has(sku)) {
            errors.push({
                field: 'sku_code',
                message: `SKU ${sku} already exists in database`
            });
        }

        // Check for duplicates in file
        if (fileSKUs.has(sku)) {
            errors.push({
                field: 'sku_code',
                message: `Duplicate SKU ${sku} in import file`
            });
        }
    }

    if (!row.primary_unit?.trim()) {
        errors.push({ field: 'primary_unit', message: 'Primary unit is required' });
    } else if (!VALID_UNITS.includes(row.primary_unit as Unit)) {
        errors.push({
            field: 'primary_unit',
            message: `Invalid unit. Must be one of: ${VALID_UNITS.join(', ')}`
        });
    }

    // Optional but validated fields
    if (row.sales_unit && !VALID_UNITS.includes(row.sales_unit as Unit)) {
        errors.push({
            field: 'sales_unit',
            message: `Invalid unit. Must be one of: ${VALID_UNITS.join(', ')}`
        });
    }

    if (row.conversion_factor !== undefined) {
        const factor = Number(row.conversion_factor);
        if (isNaN(factor) || factor <= 0) {
            errors.push({
                field: 'conversion_factor',
                message: 'Conversion factor must be a positive number'
            });
        }
    }

    // Validate numeric fields
    const numericFields: (keyof ProductImportRow)[] = ['price', 'min_stock_alert'];
    for (const field of numericFields) {
        const value = row[field];
        if (value !== undefined && value !== null && value !== '') {
            const num = Number(value);
            if (isNaN(num) || num < 0) {
                errors.push({
                    field: field as string,
                    message: `${field} must be a non-negative number`
                });
            }
        }
    }

    // Warnings
    if (!row.price) {
        warnings.push({
            field: 'price',
            message: 'No pricing information provided'
        });
    }

    if (!row.min_stock_alert) {
        warnings.push({
            field: 'min_stock_alert',
            message: 'No minimum stock alert set'
        });
    }

    return {
        row: rowIndex + 1,
        isValid: errors.length === 0,
        errors,
        warnings,
        data: row
    };
}

/**
 * Validate all rows in import
 */
export async function validateImportRows(
    rows: ProductImportRow[],
    existingSKUs: Set<string>
): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];
    const fileSKUs = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const result = validateRow(row, i, existingSKUs, fileSKUs);

        // Add SKU to file set if valid
        if (row.sku_code) {
            fileSKUs.add(row.sku_code.trim().toUpperCase());
        }

        results.push(result);
    }

    return results;
}

/**
 * Get validation summary
 */
export function getValidationSummary(results: ValidationResult[]) {
    const validCount = results.filter(r => r.isValid).length;
    const errorCount = results.filter(r => !r.isValid).length;
    const warningCount = results.filter(r => r.warnings.length > 0).length;

    return {
        total: results.length,
        valid: validCount,
        errors: errorCount,
        warnings: warningCount
    };
}
