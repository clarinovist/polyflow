import Papa from 'papaparse';

export interface StockImportRow {
    [key: string]: string | number | undefined;
    sku_code: string;
    location: string;
    quantity: number;
}

/**
 * Generate CSV template for stock import
 */
export function generateStockCSVTemplate(): string {
    const headers = [
        'sku_code',
        'location',
        'quantity'
    ];

    const exampleRows: StockImportRow[] = [
        {
            sku_code: 'RMPPG002',
            location: 'Warehouse A',
            quantity: 100
        },
        {
            sku_code: 'FGRAF002',
            location: 'Warehouse B',
            quantity: 50
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
export function downloadStockCSVTemplate() {
    const csv = generateStockCSVTemplate();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', 'stock_import_template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Parse CSV file for stock import
 */
export function parseStockCSVFile(file: File): Promise<StockImportRow[]> {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (header) => header.trim().toLowerCase(),
            complete: (results) => {
                if (results.errors.length > 0) {
                    reject(new Error(`CSV parsing errors: ${results.errors.map(e => e.message).join(', ')}`));
                } else {
                    // Filter out completely empty rows (sometimes happen with edited CSVs)
                    const validRows = (results.data as any[]).filter(row => 
                        row.sku_code || row.location || row.quantity !== undefined
                    );
                    
                    // Simple type coercion
                    const data = validRows.map(row => ({
                        sku_code: row.sku_code?.trim(),
                        location: row.location?.trim(),
                        quantity: Number(row.quantity)
                    })) as StockImportRow[];

                    resolve(data);
                }
            },
            error: (error) => {
                reject(error);
            }
        });
    });
}

/**
 * Generate error report CSV
 */
export function generateStockErrorReport(results: Array<{ row: number; errors: Array<{ field: string; message: string }> }>): string {
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
export function downloadStockErrorReport(results: Array<{ row: number; errors: Array<{ field: string; message: string }> }>) {
    const csv = generateStockErrorReport(results);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

    link.setAttribute('href', url);
    link.setAttribute('download', `stock_import_errors_${timestamp}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
