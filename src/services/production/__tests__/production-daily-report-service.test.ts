/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProductionDailyReportService } from '../production-daily-report-service';
import { prisma } from '@/lib/core/prisma';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        productionExecution: {
            findMany: vi.fn(),
        },
    },
}));

const dec = (n: number) => ({ toNumber: () => n, valueOf: () => n });

// Instants chosen to straddle WIB midnight (UTC+7):
//   2026-08-26T17:30:00Z -> 2026-08-27 00:30 WIB
//   2026-08-27T10:00:00Z -> 2026-08-27 17:00 WIB
//   2026-08-27T16:00:00Z -> 2026-08-27 23:00 WIB
//   2026-08-26T02:00:00Z -> 2026-08-26 09:00 WIB
const exec = (overrides: Record<string, unknown>) => ({
    startTime: new Date('2026-08-27T10:00:00.000Z'),
    quantityProduced: dec(100),
    scrapQuantity: dec(0),
    scrapProngkolQty: dec(0),
    scrapDaunQty: dec(0),
    machine: null,
    pieceMachineType: null,
    productionOrder: { bom: { category: 'EXTRUSION' } },
    ...overrides,
});

describe('ProductionDailyReportService.getDailyReport', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns empty rows and zero period totals when there are no executions', async () => {
        vi.mocked(prisma.productionExecution.findMany).mockResolvedValue([]);

        const report = await ProductionDailyReportService.getDailyReport({
            from: '2026-08-25',
            to: '2026-08-27',
        });

        expect(report.rows).toEqual([]);
        expect(report.periodTotals.MIXING).toEqual({
            produced: 0,
            scrap: 0,
            entries: 0,
        });
    });

    it('filters non-voided executions inside WIB day bounds', async () => {
        vi.mocked(prisma.productionExecution.findMany).mockResolvedValue([]);

        await ProductionDailyReportService.getDailyReport({
            from: '2026-08-25',
            to: '2026-08-27',
        });

        expect(prisma.productionExecution.findMany).toHaveBeenCalledTimes(1);
        const args = vi.mocked(prisma.productionExecution.findMany).mock
            .calls[0][0];
        expect(args.where.status).toEqual({ not: 'VOIDED' });
        // 2026-08-25 00:00 WIB .. 2026-08-27 23:59:59.999 WIB
        expect(args.where.startTime.gte.toISOString()).toBe(
            '2026-08-24T17:00:00.000Z',
        );
        expect(args.where.startTime.lte.toISOString()).toBe(
            '2026-08-27T16:59:59.999Z',
        );
    });

    it('buckets executions per WIB day and per process, latest day first', async () => {
        vi.mocked(prisma.productionExecution.findMany).mockResolvedValue([
            // 27 Aug WIB 00:30 — counts as the 27th despite being the 26th in UTC
            exec({
                startTime: new Date('2026-08-26T17:30:00.000Z'),
                quantityProduced: dec(250),
                scrapQuantity: dec(10),
                productionOrder: { bom: { category: 'MIXING' } },
            }),
            exec({
                startTime: new Date('2026-08-27T10:00:00.000Z'),
                quantityProduced: dec(1200),
            }),
            exec({
                startTime: new Date('2026-08-27T16:00:00.000Z'),
                quantityProduced: dec(80),
                scrapQuantity: dec(5),
                productionOrder: { bom: { category: null } },
            }),
            exec({
                startTime: new Date('2026-08-26T02:00:00.000Z'),
                quantityProduced: dec(300),
                scrapQuantity: dec(20),
                productionOrder: { bom: { category: 'PACKING' } },
            }),
        ]);

        const report = await ProductionDailyReportService.getDailyReport({
            from: '2026-08-25',
            to: '2026-08-27',
        });

        expect(report.from).toBe('2026-08-25');
        expect(report.to).toBe('2026-08-27');
        expect(report.rows.map((r) => r.date)).toEqual([
            '2026-08-27',
            '2026-08-26',
        ]);

        const day27 = report.rows[0];
        expect(day27.byProcess.MIXING).toEqual({
            produced: 250,
            scrap: 10,
            entries: 1,
        });
        expect(day27.byProcess.EXTRUSION).toEqual({
            produced: 1200,
            scrap: 0,
            entries: 1,
        });
        // Missing/null BOM category falls into OTHER
        expect(day27.byProcess.OTHER).toEqual({
            produced: 80,
            scrap: 5,
            entries: 1,
        });
        expect(day27.byProcess.PACKING).toEqual({
            produced: 0,
            scrap: 0,
            entries: 0,
        });
        expect(day27.totalScrap).toBe(15);
        expect(day27.totalEntries).toBe(3);

        const day26 = report.rows[1];
        expect(day26.byProcess.PACKING).toEqual({
            produced: 300,
            scrap: 20,
            entries: 1,
        });
        expect(day26.totalScrap).toBe(20);
        expect(day26.totalEntries).toBe(1);

        expect(report.periodTotals.MIXING.produced).toBe(250);
        expect(report.periodTotals.EXTRUSION.produced).toBe(1200);
        expect(report.periodTotals.PACKING.produced).toBe(300);
        expect(report.periodTotals.OTHER.produced).toBe(80);
        expect(report.periodTotals.OTHER.scrap).toBe(5);
    });

    it('throws on malformed date input', async () => {
        await expect(
            ProductionDailyReportService.getDailyReport({
                from: '26-08-2026',
                to: '2026-08-27',
            }),
        ).rejects.toThrow();
    });

    it('counts affal from the dedicated prongkol/daun columns, not just generic scrap', async () => {
        // Production pattern since 2026-07-28: main form writes generic=0 and
        // the dedicated columns carry the affal quantities.
        vi.mocked(prisma.productionExecution.findMany).mockResolvedValue([
            exec({
                quantityProduced: dec(5234),
                scrapQuantity: dec(0),
                scrapProngkolQty: dec(102.4),
                scrapDaunQty: dec(199.3),
            }),
        ]);

        const report = await ProductionDailyReportService.getDailyReport();

        expect(report.rows[0].totalScrap).toBeCloseTo(301.7, 5);
        expect(report.periodTotals.EXTRUSION.scrap).toBeCloseTo(301.7, 5);
    });

    it('does not double-count kiosk rows where generic scrap duplicates affal columns', async () => {
        // Kiosk writes scrapQuantity = prongkol + daun (verified invariant on
        // both production tenants). Summing all three columns would
        // double-count; max() is exact for both write shapes.
        vi.mocked(prisma.productionExecution.findMany).mockResolvedValue([
            exec({
                quantityProduced: dec(1000),
                scrapQuantity: dec(12),
                scrapProngkolQty: dec(7),
                scrapDaunQty: dec(5),
            }),
        ]);

        const report = await ProductionDailyReportService.getDailyReport();

        expect(report.rows[0].totalScrap).toBe(12);
    });

    it('defaults to today (WIB) and tolerates executions without order relation', async () => {
        vi.mocked(prisma.productionExecution.findMany).mockResolvedValue([
            exec({
                quantityProduced: dec(50),
                scrapQuantity: dec(2),
                productionOrder: null,
            }),
        ]);

        const report = await ProductionDailyReportService.getDailyReport();

        const args = vi.mocked(prisma.productionExecution.findMany).mock
            .calls[0][0];
        const today = args.where.startTime.gte.toISOString();
        expect(today).toMatch(/T17:00:00\.000Z$/);
        expect(report.from).toBe(report.to);
        expect(report.rows).toHaveLength(1);
        expect(report.rows[0].byProcess.OTHER).toEqual({
            produced: 50,
            scrap: 2,
            entries: 1,
        });
    });
});

describe('ProductionDailyReportService — machine totals (period)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('aggregates produced/scrap/entries per machine per process, sorted by produced desc', async () => {
        vi.mocked(prisma.productionExecution.findMany).mockResolvedValue([
            exec({
                quantityProduced: dec(100),
                scrapQuantity: dec(5),
                machine: { name: 'Extruder A', type: 'EXTRUDER' },
            }),
            exec({
                quantityProduced: dec(300),
                scrapProngkolQty: dec(10),
                machine: { name: 'Extruder B', type: 'EXTRUDER' },
            }),
            exec({
                quantityProduced: dec(50),
                machine: { name: 'Extruder A', type: 'EXTRUDER' },
            }),
            exec({
                quantityProduced: dec(700),
                machine: { name: 'Mixer 1', type: 'MIXER' },
                productionOrder: { bom: { category: 'MIXING' } },
            }),
        ]);

        const report = await ProductionDailyReportService.getDailyReport({
            from: '2026-08-25',
            to: '2026-08-27',
        });

        expect(report.machineTotals.EXTRUSION).toEqual([
            {
                machineName: 'Extruder B',
                machineType: 'EXTRUDER',
                produced: 300,
                scrap: 10,
                entries: 1,
            },
            {
                machineName: 'Extruder A',
                machineType: 'EXTRUDER',
                produced: 150,
                scrap: 5,
                entries: 2,
            },
        ]);
        expect(report.machineTotals.MIXING).toEqual([
            {
                machineName: 'Mixer 1',
                machineType: 'MIXER',
                produced: 700,
                scrap: 0,
                entries: 1,
            },
        ]);
        expect(report.machineTotals.PACKING).toEqual([]);
        expect(report.machineTotals.OTHER).toEqual([]);

        // Period produced per process must equal sum of machine rows.
        const extrusionSum = report.machineTotals.EXTRUSION.reduce(
            (s, m) => s + m.produced,
            0,
        );
        expect(extrusionSum).toBe(report.periodTotals.EXTRUSION.produced);
    });

    it('buckets kiosk piece-rate rows (machineId null, pieceMachineType set) by machine type', async () => {
        vi.mocked(prisma.productionExecution.findMany).mockResolvedValue([
            exec({
                quantityProduced: dec(40),
                machine: null,
                pieceMachineType: 'EXTRUDER',
            }),
            exec({
                quantityProduced: dec(60),
                machine: null,
                pieceMachineType: 'EXTRUDER',
            }),
        ]);

        const report = await ProductionDailyReportService.getDailyReport();

        expect(report.machineTotals.EXTRUSION).toEqual([
            {
                machineName: null,
                machineType: 'EXTRUDER',
                produced: 100,
                scrap: 0,
                entries: 2,
            },
        ]);
    });

    it('sorts no-machine rows last', async () => {
        vi.mocked(prisma.productionExecution.findMany).mockResolvedValue([
            exec({ quantityProduced: dec(10) }),
            exec({
                quantityProduced: dec(500),
                machine: { name: 'Extruder A', type: 'EXTRUDER' },
            }),
            exec({ quantityProduced: dec(20) }),
        ]);

        const report = await ProductionDailyReportService.getDailyReport();

        // Both no-machine executions merge into a single "(tanpa mesin)" row.
        expect(
            report.machineTotals.EXTRUSION.map((m) => m.machineName),
        ).toEqual(['Extruder A', null]);
        expect(report.machineTotals.EXTRUSION[1].produced).toBe(30);
        expect(report.machineTotals.EXTRUSION[1].entries).toBe(2);
    });
});

describe('ProductionDailyReportService.getDailyDetail', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('breaks one WIB day down per process → machine, totals match day row', async () => {
        vi.mocked(prisma.productionExecution.findMany).mockResolvedValue([
            exec({
                startTime: new Date('2026-08-26T17:30:00.000Z'),
                quantityProduced: dec(780.4),
                scrapProngkolQty: dec(40),
                scrapDaunQty: dec(21.8),
                machine: { name: 'Extruder KW 2', type: 'EXTRUDER' },
            }),
            exec({
                startTime: new Date('2026-08-27T02:00:00.000Z'),
                quantityProduced: dec(135),
                scrapQuantity: dec(44.1),
                machine: { name: 'Extruder Sedotan 1', type: 'EXTRUDER' },
            }),
            exec({
                startTime: new Date('2026-08-27T03:00:00.000Z'),
                quantityProduced: dec(616.1),
                scrapQuantity: dec(37.8),
                machine: { name: 'Extruder KW 3', type: 'EXTRUDER' },
            }),
            exec({
                startTime: new Date('2026-08-27T05:00:00.000Z'),
                quantityProduced: dec(1530),
                machine: { name: 'Mixing 1', type: 'MIXER' },
                productionOrder: { bom: { category: 'MIXING' } },
            }),
        ]);

        const detail = await ProductionDailyReportService.getDailyDetail({
            date: '2026-08-27',
        });

        // Where bounds: exactly one WIB day
        const args = vi.mocked(prisma.productionExecution.findMany).mock
            .calls[0][0];
        expect(args.where.startTime.gte.toISOString()).toBe(
            '2026-08-26T17:00:00.000Z',
        );
        expect(args.where.startTime.lte.toISOString()).toBe(
            '2026-08-27T16:59:59.999Z',
        );

        expect(detail.date).toBe('2026-08-27');
        expect(detail.byProcess.EXTRUSION.totals).toEqual({
            produced: 1531.5,
            scrap: 143.7,
            entries: 3,
        });
        expect(detail.byProcess.EXTRUSION.machines).toEqual([
            {
                machineName: 'Extruder KW 2',
                machineType: 'EXTRUDER',
                produced: 780.4,
                scrap: 61.8,
                entries: 1,
            },
            {
                machineName: 'Extruder KW 3',
                machineType: 'EXTRUDER',
                produced: 616.1,
                scrap: 37.8,
                entries: 1,
            },
            {
                machineName: 'Extruder Sedotan 1',
                machineType: 'EXTRUDER',
                produced: 135,
                scrap: 44.1,
                entries: 1,
            },
        ]);
        expect(detail.byProcess.MIXING.totals.produced).toBe(1530);
        expect(detail.byProcess.PACKING.machines).toEqual([]);
    });

    it('buckets kiosk generic-scrap rows per machine without double counting', async () => {
        vi.mocked(prisma.productionExecution.findMany).mockResolvedValue([
            exec({
                quantityProduced: dec(1000),
                scrapQuantity: dec(12),
                scrapProngkolQty: dec(7),
                scrapDaunQty: dec(5),
                machine: { name: 'Extruder A', type: 'EXTRUDER' },
            }),
        ]);

        const detail = await ProductionDailyReportService.getDailyDetail({
            date: '2026-08-27',
        });

        expect(detail.byProcess.EXTRUSION.machines[0].scrap).toBe(12);
        expect(detail.byProcess.EXTRUSION.totals.scrap).toBe(12);
    });

    it('handles kiosk piece-type rows and null category → OTHER, machine falls back to type', async () => {
        vi.mocked(prisma.productionExecution.findMany).mockResolvedValue([
            exec({
                quantityProduced: dec(80),
                scrapQuantity: dec(5),
                machine: null,
                pieceMachineType: 'GRANULATOR',
                productionOrder: { bom: { category: null } },
            }),
        ]);

        const detail = await ProductionDailyReportService.getDailyDetail({
            date: '2026-08-27',
        });

        expect(detail.byProcess.OTHER.totals).toEqual({
            produced: 80,
            scrap: 5,
            entries: 1,
        });
        expect(detail.byProcess.OTHER.machines).toEqual([
            {
                machineName: null,
                machineType: 'GRANULATOR',
                produced: 80,
                scrap: 5,
                entries: 1,
            },
        ]);
    });

    it('throws on malformed date', async () => {
        await expect(
            ProductionDailyReportService.getDailyDetail({ date: '27-08-2026' }),
        ).rejects.toThrow();
    });
});
