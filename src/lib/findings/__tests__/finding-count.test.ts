import { describe, expect, it, vi } from 'vitest';
import { countOpenVisibleFindings } from '../finding-count';

function makeDb(rows: Array<{ requiredResources: string[] }>) {
    return {
        finding: {
            count: vi.fn().mockResolvedValue(rows.length),
            findMany: vi.fn().mockResolvedValue(rows),
        },
    };
}

const AR = { requiredResources: ['/sales/invoices', '/finance/invoices'] };
const AP = { requiredResources: ['/purchasing/invoices', '/finance/invoices'] };
const STOCK = { requiredResources: ['/warehouse/inventory'] };

describe('countOpenVisibleFindings', () => {
    it('counts with a single query for full access', async () => {
        const db = makeDb([AR, AP, STOCK]);

        const total = await countOpenVisibleFindings(db as never, 'ALL');

        expect(total).toBe(3);
        expect(db.finding.count).toHaveBeenCalledTimes(1);
        expect(db.finding.findMany).not.toHaveBeenCalled();
    });

    it('only counts attention-needing statuses, never snoozed or resolved', async () => {
        const db = makeDb([AR]);

        await countOpenVisibleFindings(db as never, 'ALL');

        expect(db.finding.count).toHaveBeenCalledWith({
            where: { status: { in: ['UNCLAIMED', 'CLAIMED'] } },
        });
    });

    it('skips the query when the user has no resources at all', async () => {
        const db = makeDb([AR]);

        const total = await countOpenVisibleFindings(db as never, []);

        expect(total).toBe(0);
        expect(db.finding.findMany).not.toHaveBeenCalled();
    });

    it('applies the same visibility rule as the inbox list', async () => {
        const db = makeDb([AR, AP, STOCK]);

        const finance = await countOpenVisibleFindings(db as never, ['/finance']);
        const warehouse = await countOpenVisibleFindings(db as never, ['/warehouse']);

        expect(finance).toBe(2);
        expect(warehouse).toBe(1);
    });

    it('selects only the resource column and bounds the scan', async () => {
        const db = makeDb([AR]);

        await countOpenVisibleFindings(db as never, ['/finance']);

        const args = db.finding.findMany.mock.calls[0][0];
        expect(args.select).toEqual({ requiredResources: true });
        expect(args.take).toBeGreaterThan(0);
    });
});
