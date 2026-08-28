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
