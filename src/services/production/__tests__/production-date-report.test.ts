import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { resolveShiftAwareLogTimes } from '@/lib/production/execution-business-date';
import { ProductionDailyReportService } from '../production-daily-report-service';

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('@/lib/core/prisma', () => ({ prisma: { productionExecution: { findMany } } }));

describe('explicit WO date in daily production report', () => {
    it('buckets late input on the selected WIB day, not the save day', async () => {
        const createdAt = new Date('2026-09-02T03:00:00Z');
        const times = resolveShiftAwareLogTimes({
            logAt: createdAt, productionDate: '2026-08-20',
        });
        const row = {
            ...times, createdAt, status: 'COMPLETED',
            quantityProduced: new Prisma.Decimal(50),
            scrapQuantity: new Prisma.Decimal(0),
            scrapProngkolQty: new Prisma.Decimal(2),
            scrapDaunQty: new Prisma.Decimal(3),
            machine: null, pieceMachineType: null,
            productionOrder: { bom: { category: 'EXTRUSION' } },
        };
        findMany.mockImplementation(async ({ where }: {
            where: { startTime: { gte: Date; lte: Date } };
        }) => row.startTime >= where.startTime.gte && row.startTime <= where.startTime.lte ? [row] : []);

        const report = await ProductionDailyReportService.getDailyReport({
            from: '2026-08-20', to: '2026-08-20',
        });
        expect(report.rows).toHaveLength(1);
        expect(report.rows[0].date).toBe('2026-08-20');
        expect(report.rows[0].byProcess.EXTRUSION).toEqual({
            produced: 50, scrap: 5, entries: 1,
        });
        const saveDay = await ProductionDailyReportService.getDailyReport({
            from: '2026-09-02', to: '2026-09-02',
        });
        expect(saveDay.rows).toEqual([]);
    });
});
