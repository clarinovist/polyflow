import { StockImportRow } from './stock-csv-parser';

export interface ValidationError {
    field: string;
    message: string;
}

export interface ValidationResult {
    row: number;
    isValid: boolean;
    errors: ValidationError[];
    warnings: ValidationError[];
    data: StockImportRow;
    // Resolved IDs from database lookup
    productVariantId?: string;
    locationId?: string;
}

/**
 * Validate a single stock import row
 */
export function validateStockRow(
    row: StockImportRow,
    rowIndex: number,
    skuToVariantId: Map<string, string>,
    locationNameToId: Map<string, string>,
    processedEntries: Set<string> // SKU+Location combination check for duplicates within file
): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    let productVariantId: string | undefined;
    let locationId: string | undefined;

    // 1. Validate SKU Code
    if (!row.sku_code) {
        errors.push({ field: 'sku_code', message: 'SKU Code is required' });
    } else {
        const sku = row.sku_code.toUpperCase();
        if (skuToVariantId.has(sku)) {
            productVariantId = skuToVariantId.get(sku);
        } else {
            errors.push({ field: 'sku_code', message: `SKU '${row.sku_code}' not found in system` });
        }
    }

    // 2. Validate Location
    if (!row.location) {
        errors.push({ field: 'location', message: 'Location name is required' });
    } else {
        // Simple case-insensitive match could be better, but exact match for now as per Map key
        // Assuming the Map keys are already normalized or exact names are expected
        // Check both exact and simple trimmed name
        const locName = row.location;
        if (locationNameToId.has(locName)) {
            locationId = locationNameToId.get(locName);
        } else {
            // Try to find case-insensitive match manually if map is small? 
            // For now assume Map is populated with what we expect to match
            errors.push({ field: 'location', message: `Location '${row.location}' not found` });
        }
    }

    // 3. Validate Quantity
    if (row.quantity === undefined || row.quantity === null || row.quantity.toString().trim() === '') {
        errors.push({ field: 'quantity', message: 'Quantity is required' });
    } else {
        const qty = Number(row.quantity);
        if (isNaN(qty)) {
            errors.push({ field: 'quantity', message: 'Quantity must be a number' });
        } else if (qty < 0) {
            errors.push({ field: 'quantity', message: 'Quantity cannot be negative' });
        } else if (qty === 0) {
            warnings.push({ field: 'quantity', message: 'Quantity is 0, this entry will be skipped' });
        }
    }

    // 4. Duplicate Check (within file)
    if (row.sku_code && row.location) {
        const entryKey = `${row.sku_code.toUpperCase()}|${row.location}`;
        if (processedEntries.has(entryKey)) {
            warnings.push({ field: 'sku_code', message: 'Duplicate SKU+Location entry in this file. It is recommended to combine them.' });
            // We still process it (additive), but warn the user.
        }
        processedEntries.add(entryKey);
    }

    return {
        row: rowIndex + 1,
        isValid: errors.length === 0,
        errors,
        warnings,
        data: row,
        productVariantId,
        locationId
    };
}

/**
 * Validate all rows
 */
export function validateStockImportRows(
    rows: StockImportRow[],
    skuToVariantId: Map<string, string>,
    locationNameToId: Map<string, string>
): ValidationResult[] {
    const results: ValidationResult[] = [];
    const processedEntries = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
        results.push(validateStockRow(rows[i], i, skuToVariantId, locationNameToId, processedEntries));
    }

    return results;
}

/**
 * Get validation summary
 */
export function getStockValidationSummary(results: ValidationResult[]) {
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
