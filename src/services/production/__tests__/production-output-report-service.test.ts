import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { parseOutputReportFilter } from '@/lib/production/output-report';
import { ProductionOutputReportService, type OutputExecution } from '../production-output-report-service';

const { findMany, groupBy } = vi.hoisted(() => ({ findMany: vi.fn(), groupBy: vi.fn() }));
vi.mock('@/lib/core/prisma', () => ({ prisma: { productionExecution: { findMany, groupBy } } }));
const decimal = (n: string | number) => new Prisma.Decimal(n);
function execution(overrides: Partial<OutputExecution> = {}): OutputExecution {
    return {
        id: 'entry-1', startTime: new Date('2026-09-02T16:00:00Z'),
        endTime: new Date('2026-09-02T18:00:00Z'),
        quantityProduced: decimal(100), scrapQuantity: decimal(0),
        scrapProngkolQty: decimal(0), scrapDaunQty: decimal(0),
        enteredQuantity: null, enteredUnit: null,
        machine: { id: 'machine-1', code: 'EX-01', name: 'Mesin Uji' },
        pieceMachineType: null,
        operator: { id: 'operator-1', name: 'Operator Uji' }, shift: null,
        productionOrder: { id: 'order-1', orderNumber: 'SPK-TEST-1', status: 'IN_PROGRESS',
            plannedQuantity: decimal(1000), plannedStartDate: new Date('2026-09-02T00:00:00Z'), bom: {
            category: 'EXTRUSION', productVariant: {
                id: 'variant-1', name: 'Varian Uji', skuCode: 'TEST-WIP', primaryUnit: 'KG',
                product: { name: 'Produk Uji', productType: 'WIP' },
            },
        } }, ...overrides,
    };
}
const filter = (params = {}) => parseOutputReportFilter({ from: '2026-09-01', to: '2026-09-30', ...params });

beforeEach(() => { findMany.mockReset().mockResolvedValue([]); groupBy.mockReset().mockResolvedValue([]); });
describe('ProductionOutputReportService', () => {
    it('queries all nonvoided output by WIB start date, without FG/location/row limits', async () => {
        await ProductionOutputReportService.getReport(filter());
        const args = findMany.mock.calls[0][0];
        expect(args.where.status).toEqual({ not: 'VOIDED' });
        expect(args.where.startTime).toEqual({
            gte: new Date('2026-08-31T17:00:00Z'), lte: new Date('2026-09-30T16:59:59.999Z'),
        });
        expect(args.take).toBeUndefined();
        expect(args.where.productionOrder).toBeUndefined();
        expect(args.select).not.toHaveProperty('pieceEarnings');
        expect(args.select).not.toHaveProperty('helpers');
    });
    it('includes INTERMEDIATE history and respects database WIB/status predicates', async () => {
        const base = execution();
        const intermediate = execution({ id: 'intermediate', startTime: new Date('2026-08-31T17:00:00Z'),
            productionOrder: { ...base.productionOrder, bom: { ...base.productionOrder.bom, productVariant: {
                ...base.productionOrder.bom.productVariant, product: { name: 'Produk Antara Uji', productType: 'INTERMEDIATE' },
            } } },
        });
        const candidates = [
            { ...intermediate, status: 'COMPLETED' },
            { ...base, id: 'void', status: 'VOIDED' },
            { ...base, id: 'outside', status: 'COMPLETED', startTime: new Date('2026-08-31T16:59:59.999Z') },
        ];
        findMany.mockImplementation(async ({ where }) => candidates.filter(row => row.status !== where.status.not && row.startTime >= where.startTime.gte && row.startTime <= where.startTime.lte));
        const report = await ProductionOutputReportService.getReport(filter({ mode: 'entries' }));
        expect(report.entries.map(e => e.id)).toEqual(['intermediate']);
        expect(report.entries[0].productType).toBe('INTERMEDIATE');
        expect(JSON.stringify(findMany.mock.calls[0][0])).not.toMatch(/archivedAt|ACTIVE|FINISHED_GOOD/);
    });
    it('counts all 501 entries before paginating; detail and aggregates reconcile', async () => {
        findMany.mockResolvedValue(Array.from({ length: 501 }, (_, i) => execution({ id: `e-${i}`, quantityProduced: decimal('0.0001') })));
        const report = await ProductionOutputReportService.getReport(filter());
        expect(report.summary).toMatchObject({ products: 1, entries: 501, orders: 1 });
        expect(report.rows[0]).toMatchObject({ produced: '0.0501', entries: 501, orders: 1, productType: 'WIP' });
        const detail = await ProductionOutputReportService.getReport(filter({ mode: 'entries', page: '11' }));
        expect(detail.entries).toHaveLength(1);
        expect(detail.summary).toEqual(report.summary);
        expect(detail.pageCount).toBe(11);
    });
    it('uses execution operator first, shift only as fallback; includes unknown identities', async () => {
        const shift = { operator: { id: 'operator-2', name: 'Operator Uji' } };
        findMany.mockResolvedValue([
            execution({ shift }), execution({ id: 'e2', operator: null, shift }),
            execution({ id: 'e3', operator: null, machine: null, pieceMachineType: 'EXTRUDER' }),
        ]);
        const report = await ProductionOutputReportService.getReport(filter({ mode: 'operator' }));
        expect(report.rows).toHaveLength(3);
        expect(report.rows.map(r => r.operatorId).sort()).toEqual(['operator-1', 'operator-2', 'unassigned']);
        const selected = await ProductionOutputReportService.getReport(filter({ operatorId: 'operator-2', mode: 'entries' }));
        expect(selected.entries.map(e => e.id)).toEqual(['e2']);
        expect(selected.entries[0].operatorSource).toBe('shift');
        const missing = await ProductionOutputReportService.getReport(filter({ operatorId: 'unassigned', machineId: 'unassigned', mode: 'entries' }));
        expect(missing.entries[0]).toMatchObject({ id: 'e3', operatorSource: 'missing', machineName: 'EXTRUDER (tanpa mesin)' });
    });
    it('applies product, operator, machine, process and text together before pagination', async () => {
        findMany.mockResolvedValue([execution(), execution({ id: 'e2', operator: { id: 'other', name: 'Lain' } })]);
        const result = await ProductionOutputReportService.getReport(filter({
            productVariantId: 'variant-1', operatorId: 'operator-1', machineId: 'machine-1', process: 'EXTRUSION', q: 'test-wip',
        }));
        expect(result.summary.entries).toBe(1);
        for (const params of [{ productVariantId: 'unknown' }, { machineId: 'unknown' }, { process: 'PACKING' }, { q: 'missing' }]) {
            expect((await ProductionOutputReportService.getReport(filter(params))).summary.entries).toBe(0);
        }
        expect(result.options.operators).toHaveLength(2);
    });
    it('separates stages, units and variant IDs; does not reconvert entered quantity', async () => {
        const base = execution();
        const packing = execution({ id: 'packing', quantityProduced: decimal(20), enteredQuantity: decimal(2), enteredUnit: 'BAL',
            productionOrder: { ...base.productionOrder, id: 'order-2', bom: { category: 'PACKING', productVariant: {
                ...base.productionOrder.bom.productVariant, id: 'variant-2', primaryUnit: 'PCS', product: { name: 'Produk Uji', productType: 'FINISHED_GOOD' },
            } } }, scrapQuantity: decimal(3),
        });
        findMany.mockResolvedValue([base, packing, execution({ id: 'mix', productionOrder: { ...base.productionOrder, bom: { ...base.productionOrder.bom, category: 'MIXING' } } })]);
        const report = await ProductionOutputReportService.getReport(filter());
        expect(report.rows).toHaveLength(3);
        expect(report.summary.totals).toHaveLength(3);
        expect(report.summary.orders).toBe(2);
        expect(report.rows.find(r => r.unit === 'PCS')).toMatchObject({ produced: '20', scrapKg: null });
        const detail = await ProductionOutputReportService.getReport(filter({ mode: 'entries', process: 'PACKING' }));
        expect(detail.entries[0]).toMatchObject({ produced: '20', enteredQuantity: '2', enteredUnit: 'BAL', scrapRaw: '3' });
    });
    it('deduplicates affal per row, not max of aggregate columns; keeps scrap-only entries', async () => {
        findMany.mockResolvedValue([
            execution({ quantityProduced: decimal(0), scrapQuantity: decimal(5), scrapProngkolQty: decimal(2), scrapDaunQty: decimal(3) }),
            execution({ id: 'e2', scrapQuantity: decimal(4) }),
            execution({ id: 'e3', scrapProngkolQty: decimal(7), scrapDaunQty: decimal(1) }),
        ]);
        const result = await ProductionOutputReportService.getReport(filter());
        expect(result.rows[0]).toMatchObject({ produced: '200', scrapKg: '17', entries: 3 });
    });
    it('keeps four-decimal scrap precision without floating addition noise', async () => {
        findMany.mockResolvedValue([execution({ scrapProngkolQty: decimal('0.1'), scrapDaunQty: decimal('0.2') })]);
        expect((await ProductionOutputReportService.getReport(filter())).rows[0].scrapKg).toBe('0.3');
    });
    it('retains running output, excludes empty running shells, retains completed zero rework', async () => {
        const base = execution();
        findMany.mockResolvedValue([
            execution({ endTime: null, quantityProduced: decimal(0) }),
            execution({ id: 'running', endTime: null }),
            execution({ id: 'rework', quantityProduced: decimal(0), machine: null, operator: null,
                productionOrder: { ...base.productionOrder, bom: { ...base.productionOrder.bom, category: 'REWORK' } } }),
        ]);
        const result = await ProductionOutputReportService.getReport(filter({ mode: 'entries' }));
        expect(result.entries.map(e => e.id).sort()).toEqual(['rework', 'running']);
        expect(result.entries.find(e => e.id === 'rework')).toMatchObject({ process: 'OTHER', machineName: 'Belum tercatat' });
    });
    it('handles 50,000 synthetic entries without truncating totals or sending raw period data', async () => {
        const base = execution();
        const start = performance.now();
        const heap = process.memoryUsage().heapUsed;
        findMany.mockResolvedValue(Array.from({ length: 50_000 }, (_, i) => ({ ...base, id: `stress-${i}` })));
        const report = await ProductionOutputReportService.getReport(filter());
        expect(report.summary.entries).toBe(50_000);
        expect(report.rows[0].produced).toBe('5000000');
        expect(report.entries).toEqual([]);
        console.info(`Output report synthetic 50k: ${Math.round(performance.now() - start)}ms, heap delta ${Math.round((process.memoryUsage().heapUsed - heap) / 1024 / 1024)}MiB (not a DB benchmark)`);
    });
    it('rejects invalid direct service filters before query', async () => {
        await expect(ProductionOutputReportService.getReport({ ...filter(), from: 'bad' })).rejects.toThrow('Tanggal');
        expect(findMany).not.toHaveBeenCalled();
    });
    it('returns honest empty state, clamps stale page and propagates DB errors', async () => {
        const empty = await ProductionOutputReportService.getReport(filter({ page: '10' }));
        expect(empty).toMatchObject({ rows: [], entries: [], totalRows: 0, pageCount: 1, filter: { page: 1 } });
        findMany.mockRejectedValue(new Error('unavailable'));
        await expect(ProductionOutputReportService.getReport(filter())).rejects.toThrow('unavailable');
    });
    it('reports SPK target against period and cumulative actuals without multiplying the target', async () => {
        findMany.mockResolvedValue([
            execution({ quantityProduced: decimal(30) }),
            execution({ id: 'e2', quantityProduced: decimal(20) }),
            execution({ id: 'e3', quantityProduced: decimal(10), startTime: new Date('2026-09-05T02:00:00Z') }),
        ]);
        groupBy.mockResolvedValue([{ productionOrderId: 'order-1', _sum: { quantityProduced: decimal(75) } }]);
        const report = await ProductionOutputReportService.getReport(filter({ mode: 'order' }));
        expect(report.orders).toHaveLength(1);
        expect(report.orders[0]).toMatchObject({
            orderId: 'order-1', orderNumber: 'SPK-TEST-1', status: 'IN_PROGRESS', unit: 'KG',
            hasTarget: true, target: '1000', producedInPeriod: '60', producedCumulative: '75',
            difference: '-925', achievement: '7.5',
        });
        expect(report.rows).toEqual([]);
        expect(report.entries).toEqual([]);
        expect(report.totalRows).toBe(1);
        expect(groupBy).toHaveBeenCalledTimes(1);
        expect(groupBy).toHaveBeenCalledWith(expect.objectContaining({
            by: ['productionOrderId'],
            where: { status: { not: 'VOIDED' }, productionOrderId: { in: ['order-1'] } },
        }));
    });
    it('shows overproduction and target-less SPK honestly instead of infinity', async () => {
        const base = execution();
        findMany.mockResolvedValue([
            execution({ quantityProduced: decimal(50) }),
            execution({ id: 'e2', quantityProduced: decimal(10), productionOrder: {
                ...base.productionOrder, id: 'order-2', orderNumber: 'SPK-2', plannedQuantity: decimal(0),
            } }),
        ]);
        groupBy.mockResolvedValue([
            { productionOrderId: 'order-1', _sum: { quantityProduced: decimal(1200) } },
            { productionOrderId: 'order-2', _sum: { quantityProduced: decimal(20) } },
        ]);
        const report = await ProductionOutputReportService.getReport(filter({ mode: 'order' }));
        expect(report.orders.find(o => o.orderId === 'order-1')).toMatchObject({
            hasTarget: true, target: '1000', producedCumulative: '1200', difference: '200', achievement: '120',
        });
        expect(report.orders.find(o => o.orderId === 'order-2')).toMatchObject({
            hasTarget: false, target: '0', difference: null, achievement: null,
        });
        expect(report.orders.find(o => o.orderId === 'order-2')!.producedInPeriod).toBe('10');
    });
    it('keeps non-SPK modes free of the cumulative query and scopes SPK mode to filtered entries', async () => {
        const base = execution();
        findMany.mockResolvedValue([
            execution(),
            execution({ id: 'e2', productionOrder: { ...base.productionOrder, id: 'order-2', orderNumber: 'SPK-2',
                bom: { ...base.productionOrder.bom, category: 'PACKING' } } }),
        ]);
        const product = await ProductionOutputReportService.getReport(filter());
        expect(product.orders).toEqual([]);
        expect(groupBy).not.toHaveBeenCalled();

        const scoped = await ProductionOutputReportService.getReport(filter({ mode: 'order', process: 'EXTRUSION' }));
        expect(scoped.orders.map(o => o.orderId)).toEqual(['order-1']);
        expect(groupBy).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ productionOrderId: { in: ['order-1'] } }),
        }));

        groupBy.mockClear();
        const empty = await ProductionOutputReportService.getReport(filter({ mode: 'order', q: 'missing' }));
        expect(empty).toMatchObject({ orders: [], totalRows: 0, pageCount: 1 });
        expect(groupBy).not.toHaveBeenCalled();
    });
});
