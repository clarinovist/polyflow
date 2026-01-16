import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { ProductType, Unit } from '@prisma/client';

export interface ProductImportRow {
    [key: string]: string | number | boolean | null | undefined;
    product_name: string;
    product_type: string;
    variant_name: string;
    sku_code: string;
    primary_unit: string;
    sales_unit?: string;
    conversion_factor?: number;
    price?: number;
    min_stock_alert?: number;
    color?: string;
    material?: string;
    notes?: string;
    supplier_name?: string;
}

export interface ParsedProduct {
    productName: string;
    productType: ProductType;
    variants: {
        name: string;
        skuCode: string;
        primaryUnit: Unit;
        salesUnit?: Unit;
        conversionFactor: number;
        price?: number;
        minStockAlert?: number;
        supplierName?: string;
        attributes?: Record<string, string | number | boolean | null>;
    }[];
}

/**
 * Generate CSV template for product import
 */
export function generateCSVTemplate(): string {
    const headers = [
        'product_name',
        'product_type',
        'variant_name',
        'sku_code',
        'primary_unit',
        'sales_unit',
        'conversion_factor',
        'price',
        'min_stock_alert',
        'color',
        'material',
        'notes',
        'supplier_name'
    ];

    const exampleRows: ProductImportRow[] = [
        {
            product_name: 'Pure PP Granules',
            product_type: 'RAW_MATERIAL',
            variant_name: 'Pure PP Granules Standard',
            sku_code: 'RMPPG002',
            primary_unit: 'KG',
            sales_unit: 'KG',
            conversion_factor: 1,
            price: 15000,
            min_stock_alert: 100,
            color: 'Clear',
            material: 'PP',
            supplier_name: 'PT. Poly Supply'
        },
        {
            product_name: 'Blue Colorant',
            product_type: 'RAW_MATERIAL',
            variant_name: 'Blue Colorant Masterbatch',
            sku_code: 'RMCLR002',
            primary_unit: 'KG',
            sales_unit: 'KG',
            conversion_factor: 1,
            price: 50000,
            min_stock_alert: 50,
            color: 'Blue',
            material: 'Masterbatch'
        },
        {
            product_name: 'Blue Raffia',
            product_type: 'FINISHED_GOOD',
            variant_name: 'Blue Raffia - Bal of 5',
            sku_code: 'FGRAF002',
            primary_unit: 'KG',
            sales_unit: 'BAL',
            conversion_factor: 5,
            price: 90000,
            min_stock_alert: 20,
            color: 'Blue',
            material: 'Raffia'
        }
    ];

    const csv = Papa.unparse([...exampleRows], {
        columns: headers,
        header: true
    });

    return csv;
}

/**
 * Download CSV template as file
 */
export function downloadCSVTemplate() {
    const csv = generateCSVTemplate();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', 'product_import_template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * Parse CSV file
 */
export function parseCSVFile(file: File): Promise<ProductImportRow[]> {
    return new Promise((resolve, reject) => {
        Papa.parse<ProductImportRow>(file, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (header) => header.trim().toLowerCase(),
            complete: (results) => {
                if (results.errors.length > 0) {
                    reject(new Error(`CSV parsing errors: ${results.errors.map(e => e.message).join(', ')}`));
                } else {
                    resolve(results.data);
                }
            },
            error: (error) => {
                reject(error);
            }
        });
    });
}

/**
 * Group rows by product name
 */
export function groupByProduct(rows: ProductImportRow[]): Map<string, ProductImportRow[]> {
    const grouped = new Map<string, ProductImportRow[]>();

    for (const row of rows) {
        const productName = row.product_name?.trim();
        if (!productName) continue;

        if (!grouped.has(productName)) {
            grouped.set(productName, []);
        }
        grouped.get(productName)!.push(row);
    }

    return grouped;
}

/**
 * Convert import rows to product data structure
 */
export function rowsToProducts(rows: ProductImportRow[]): ParsedProduct[] {
    const grouped = groupByProduct(rows);
    const products: ParsedProduct[] = [];

    for (const [productName, variants] of grouped) {
        // Use first variant to determine product type
        const productType = variants[0].product_type as ProductType;

        products.push({
            productName,
            productType,
            variants: variants.map(v => ({
                name: v.variant_name,
                skuCode: v.sku_code,
                primaryUnit: v.primary_unit as Unit,
                salesUnit: v.sales_unit as Unit | undefined,
                conversionFactor: v.conversion_factor || 1,
                price: v.price,
                minStockAlert: v.min_stock_alert,
                supplierName: v.supplier_name?.trim(),
                attributes: buildAttributes(v)
            }))
        });
    }

    return products;
}

function buildAttributes(row: ProductImportRow): Record<string, string | number | boolean | null> | undefined {
    const attrs: Record<string, string | number | boolean | null> = {};

    if (row.color) attrs.color = row.color;
    if (row.material) attrs.material = row.material;
    if (row.notes) attrs.notes = row.notes;

    return Object.keys(attrs).length > 0 ? attrs : undefined;
}

/**
 * Generate Excel template for product import
 */
export function generateExcelTemplate(): Blob {
    const headers = [
        'product_name',
        'product_type',
        'variant_name',
        'sku_code',
        'primary_unit',
        'sales_unit',
        'conversion_factor',
        'price',
        'min_stock_alert',
        'color',
        'material',
        'notes',
        'supplier_name'
    ];

    const exampleRows = [
        {
            product_name: 'Pure PP Granules',
            product_type: 'RAW_MATERIAL',
            variant_name: 'Pure PP Granules Standard',
            sku_code: 'RMPPG002',
            primary_unit: 'KG',
            sales_unit: 'KG',
            conversion_factor: 1,
            price: 15000,
            min_stock_alert: 100,
            color: 'Clear',
            material: 'PP',
            notes: '',
            supplier_name: 'PT. Poly Supply'
        },
        {
            product_name: 'Blue Colorant',
            product_type: 'RAW_MATERIAL',
            variant_name: 'Blue Colorant Masterbatch',
            sku_code: 'RMCLR002',
            primary_unit: 'KG',
            sales_unit: 'KG',
            conversion_factor: 1,
            price: 50000,
            min_stock_alert: 50,
            color: 'Blue',
            material: 'Masterbatch',
            notes: '',
            supplier_name: 'PT. Poly Supply'
        },
        {
            product_name: 'Blue Raffia',
            product_type: 'FINISHED_GOOD',
            variant_name: 'Blue Raffia - Bal of 5',
            sku_code: 'FGRAF002',
            primary_unit: 'KG',
            sales_unit: 'BAL',
            conversion_factor: 5,
            price: 90000,
            min_stock_alert: 20,
            color: 'Blue',
            material: 'Raffia',
            notes: '',
            supplier_name: 'PT. Poly Supply'
        }
    ];

    // Create worksheet
    const worksheet = XLSX.utils.json_to_sheet(exampleRows, { header: headers });

    // Set column widths
    worksheet['!cols'] = [
        { wch: 20 }, // product_name
        { wch: 15 }, // product_type
        { wch: 25 }, // variant_name
        { wch: 12 }, // sku_code
        { wch: 12 }, // primary_unit
        { wch: 12 }, // sales_unit
        { wch: 15 }, // conversion_factor
        { wch: 10 }, // price
        { wch: 15 }, // min_stock_alert
        { wch: 10 }, // color
        { wch: 15 }, // material
        { wch: 20 }, // notes
        { wch: 25 }  // supplier_name
    ];

    // Create workbook
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');

    // Generate buffer
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    return new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/**
 * Download Excel template as file
 */
export function downloadExcelTemplate() {
    const blob = generateExcelTemplate();
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', 'product_import_template.xlsx');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Parse Excel file (.xlsx or .xls)
 */
export function parseExcelFile(file: File): Promise<ProductImportRow[]> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                const workbook = XLSX.read(data, { type: 'binary' });

                // Use first sheet
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];

                // Convert to JSON
                const jsonData = XLSX.utils.sheet_to_json<ProductImportRow>(worksheet, {
                    raw: false,
                    defval: ''
                });

                // Normalize headers to lowercase
                const normalizedData = jsonData.map((row) => {
                    const normalized: Record<string, string | number | boolean | null | undefined> = {};
                    for (const key in row) {
                        normalized[key.trim().toLowerCase()] = row[key];
                    }
                    return normalized as ProductImportRow;
                });

                resolve(normalizedData);
            } catch (error) {
                reject(new Error(`Excel parsing error: ${error instanceof Error ? error.message : "Unknown error"}`));
            }
        };

        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsBinaryString(file);
    });
}

/**
 * Parse file (auto-detect CSV or Excel)
 */
export async function parseImportFile(file: File): Promise<ProductImportRow[]> {
    const fileName = file.name.toLowerCase();

    if (fileName.endsWith('.csv')) {
        return parseCSVFile(file);
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        return parseExcelFile(file);
    } else {
        throw new Error('Unsupported file type. Please upload .csv, .xlsx, or .xls file');
    }
}

/**
 * Generate error report CSV
 */
export function generateErrorReport(results: Array<{ row: number; errors: Array<{ field: string; message: string }> }>): string {
    const errorRows = results.filter(r => r.errors.length > 0);

    const reportData = errorRows.map(r => ({
        row: r.row,
        errors: r.errors.map(e => `${e.field}: ${e.message}`).join(' | ')
    }));

    return Papa.unparse(reportData, {
        columns: ['row', 'errors'],
        header: true
    });
}

/**
 * Download error report
 */
export function downloadErrorReport(results: Array<{ row: number; errors: Array<{ field: string; message: string }> }>) {
    const csv = generateErrorReport(results);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

    link.setAttribute('href', url);
    link.setAttribute('download', `import_errors_${timestamp}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
