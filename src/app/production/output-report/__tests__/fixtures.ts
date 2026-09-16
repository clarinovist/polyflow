import { parseOutputReportFilter, type OutputReport } from '@/lib/production/output-report';

export function reportFixture(): OutputReport {
    return {
        filter: parseOutputReportFilter({ from: '2026-09-01', to: '2026-09-16' }),
        options: {
            products: [{ id: 'variant-test', label: 'Produk Uji · Hitam (TEST-WIP)' }],
            operators: [{ id: 'operator-test', label: 'Operator Uji' }],
            machines: [{ id: 'machine-test', label: 'EX-01' }],
        },
        summary: { products: 1, entries: 501, orders: 2, totals: [{ process: 'EXTRUSION', unit: 'KG', produced: '1234.5678' }] },
        rows: [{
            key: 'row-test', productVariantId: 'variant-test', productName: 'Produk Uji', variantName: 'Hitam',
            sku: 'TEST-WIP', productType: 'WIP', process: 'EXTRUSION', unit: 'KG', operatorId: null,
            operators: [{ id: 'operator-test', label: 'Operator Uji' }],
            produced: '1234.5678', scrapKg: '12', entries: 501, orders: 2,
        }], entries: [], totalRows: 1, pageCount: 1,
    };
}
