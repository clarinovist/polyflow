import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ lock: vi.fn(), period: vi.fn(), update: vi.fn(), close: vi.fn(), audit: vi.fn() }));
const tx = { $queryRaw: m.lock, fiscalPeriod: { findUnique: m.period, update: m.update } };
vi.mock('@/lib/core/prisma', () => ({ prisma: { $transaction: (callback: (client: typeof tx) => unknown) => callback(tx) } }));
vi.mock('../journals-service', () => ({ createClosingJournalEntry: m.close }));
vi.mock('@/lib/tools/audit', () => ({ logActivity: m.audit }));
import { closeFiscalPeriod } from '../periods-service';
beforeEach(() => { vi.resetAllMocks(); m.period.mockResolvedValue({ id: 'period', status: 'OPEN' }); m.update.mockResolvedValue({ id: 'period', status: 'CLOSED' }); });
describe('period close atomic locking', () => {
    it('locks before reading status/closing balances and audits in the same transaction', async () => {
        expect(await closeFiscalPeriod('period', 'actor')).toMatchObject({ status: 'CLOSED' });
        expect(m.lock.mock.calls[0][0].join('')).toContain('FOR UPDATE');
        expect(m.lock.mock.invocationCallOrder[0]).toBeLessThan(m.period.mock.invocationCallOrder[0]);
        expect(m.period.mock.invocationCallOrder[0]).toBeLessThan(m.close.mock.invocationCallOrder[0]);
        expect(m.close).toHaveBeenCalledWith('period', 'actor', tx);
        expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ tx, action: 'CLOSE_FISCAL_PERIOD' }));
    });
    it('rejects an already closed or missing period under the lock', async () => {
        m.period.mockResolvedValue({ status: 'CLOSED' }); await expect(closeFiscalPeriod('period', 'actor')).rejects.toThrow('OPEN');
        m.period.mockResolvedValue(null); await expect(closeFiscalPeriod('period', 'actor')).rejects.toThrow('OPEN');
        expect(m.close).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled();
    });
    it('propagates closing/audit failures instead of claiming success', async () => {
        m.close.mockRejectedValue(new Error('balance failure')); await expect(closeFiscalPeriod('period', 'actor')).rejects.toThrow('balance failure');
        expect(m.update).not.toHaveBeenCalled();
        m.close.mockResolvedValue(null); m.audit.mockRejectedValue(new Error('audit failure')); await expect(closeFiscalPeriod('period', 'actor')).rejects.toThrow('audit failure');
    });
});
