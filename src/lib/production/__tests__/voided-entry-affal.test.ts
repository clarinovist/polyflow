import { describe, expect, it } from 'vitest';

import { voidedAffalAwaitingReentry } from '../voided-entry-affal';

const entry = (
    id: string,
    status: string,
    createdAt: string,
    updatedAt: string,
    scrap: { scrapQuantity?: number; scrapProngkolQty?: number; scrapDaunQty?: number } = {},
) => ({ id, status, createdAt, updatedAt, scrapQuantity: 0, scrapProngkolQty: 0, scrapDaunQty: 0, ...scrap });

describe('voidedAffalAwaitingReentry', () => {
    it('returns the voided affal while the void has not been re-entered yet', () => {
        const executions = [
            entry('done', 'COMPLETED', '2026-10-27T03:23:00Z', '2026-10-27T03:23:00Z', { scrapDaunQty: 7.5 }),
            entry('void', 'VOIDED', '2026-10-27T08:51:00Z', '2026-10-27T09:01:58Z', { scrapQuantity: 9, scrapDaunQty: 9 }),
        ];
        expect(voidedAffalAwaitingReentry(executions)).toEqual({
            voidedAt: new Date('2026-10-27T09:01:58Z'),
            prongkol: 0,
            daun: 9,
            total: 9,
        });
    });

    it('returns null once an entry was recorded after the void', () => {
        const executions = [
            entry('void', 'VOIDED', '2026-10-27T08:51:00Z', '2026-10-27T09:01:58Z', { scrapDaunQty: 9 }),
            entry('redo', 'COMPLETED', '2026-10-27T09:02:42Z', '2026-10-27T09:02:42Z'),
        ];
        expect(voidedAffalAwaitingReentry(executions)).toBeNull();
    });

    it('uses the most recent void and ignores voids without affal', () => {
        const older = entry('old', 'VOIDED', '2026-10-24T01:00:00Z', '2026-10-24T01:30:00Z', { scrapProngkolQty: 4 });
        const latest = entry('new', 'VOIDED', '2026-10-24T02:00:00Z', '2026-10-24T02:30:00Z');
        expect(voidedAffalAwaitingReentry([older, latest])).toBeNull();
    });

    it('reads kiosk rows that keep affal only in the generic column', () => {
        const kiosk = entry('kiosk', 'VOIDED', '2026-10-24T01:00:00Z', '2026-10-24T01:30:00Z', { scrapQuantity: 0.32 });
        expect(voidedAffalAwaitingReentry([kiosk])).toMatchObject({ prongkol: 0, daun: 0, total: 0.32 });
    });

    it('returns null when nothing was voided', () => {
        expect(voidedAffalAwaitingReentry([])).toBeNull();
        expect(voidedAffalAwaitingReentry([entry('a', 'COMPLETED', '2026-10-27T03:00:00Z', '2026-10-27T03:00:00Z')])).toBeNull();
    });
});
