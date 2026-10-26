// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseImportFile, rowsToProducts } from '../csv-parser';

const row = {
    product_name: 'Produk Uji',
    product_type: 'RAW_MATERIAL',
    variant_name: 'Standar',
    sku_code: 'TEST-001',
    primary_unit: 'KG',
    price: 12345.5,
    color: 'Biru',
};

describe('real SheetJS product import', () => {
    it.each(['xlsx', 'xls'] as const)('reads a real %s workbook', async (extension) => {
        const sheet = XLSX.utils.json_to_sheet([row]);
        const workbook = { SheetNames: ['Products'], Sheets: { Products: sheet } };
        const bytes: ArrayBuffer = XLSX.write(workbook, {
            bookType: extension === 'xls' ? 'biff8' : 'xlsx',
            type: 'array',
        });
        const parsed = await parseImportFile(new File([bytes], `products.${extension}`));
        expect(parsed).toHaveLength(1);
        expect(parsed[0]).toMatchObject({ ...row, price: '12345.5' });
        expect(rowsToProducts(parsed)[0]).toMatchObject({
            productName: row.product_name,
            productType: row.product_type,
            variants: [{ skuCode: row.sku_code, primaryUnit: row.primary_unit }],
        });
    });
});
