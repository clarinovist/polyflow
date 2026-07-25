import { describe, expect, it } from 'vitest';
import { getWibDayBounds, toBusinessDateString } from '@/lib/utils/timezone';

describe('operator today summary helpers', () => {
  it('correctly formats WIB business date string and computes start/end bounds', () => {
    const date = new Date(2026, 6, 26, 10, 0, 0); // 26 Jul 2026 10:00
    const dateStr = toBusinessDateString(date);
    expect(dateStr).toBe('2026-07-26');

    const bounds = getWibDayBounds(dateStr);
    expect(bounds.startOfDay).toBeInstanceOf(Date);
    expect(bounds.endOfDay).toBeInstanceOf(Date);
    expect(bounds.endOfDay.getTime() - bounds.startOfDay.getTime()).toBe(86_400_000 - 1);
  });

  it('aggregates executions into jobCount, goodQty, and scrapQty correctly', () => {
    const executions = [
      { productionOrderId: 'po-1', quantityProduced: '50.5', scrapQuantity: '1.5', endTime: new Date() },
      { productionOrderId: 'po-1', quantityProduced: '40.0', scrapQuantity: '0.5', endTime: new Date() },
      { productionOrderId: 'po-2', quantityProduced: '30.0', scrapQuantity: '0.0', endTime: null },
    ];

    const uniqueOrders = new Set(executions.map((e) => e.productionOrderId));
    const jobCount = uniqueOrders.size;
    const goodQty = executions.reduce((sum, e) => sum + Number(e.quantityProduced || 0), 0);
    const scrapQty = executions.reduce((sum, e) => sum + Number(e.scrapQuantity || 0), 0);
    const activeJobsCount = executions.filter((e) => !e.endTime).length;

    expect(jobCount).toBe(2);
    expect(goodQty).toBe(120.5);
    expect(scrapQty).toBe(2);
    expect(activeJobsCount).toBe(1);
  });
});
