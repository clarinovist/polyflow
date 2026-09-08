import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const fetchLedger = vi.hoisted(() => vi.fn());
vi.mock('@/actions/finance/account-actions', () => ({ getAccountLedger: fetchLedger }));
vi.mock('@/components/finance/coa/AccountLedgerClient', () => ({ AccountLedgerClient: () => null }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND'); } }));
import Page from '../page';

beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-31T18:00:00Z'));
    fetchLedger.mockResolvedValue({ success: true, data: { entries: [] } });
});
afterEach(() => vi.useRealTimers());
const params = Promise.resolve({ id: 'account' });
describe('AccountLedgerPage dates', () => {
    it.each([null, { success: false, error: 'Unavailable' }, { success: true, data: null }])
    ('handles unavailable ledger results without rendering data', async (result) => {
        fetchLedger.mockResolvedValue(result);
        await expect(Page({ params, searchParams: Promise.resolve({}) })).rejects.toThrow('NOT_FOUND');
    });
    it('handles a rejected ledger fetch', async () => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        fetchLedger.mockRejectedValue(new Error('Unavailable'));
        await expect(Page({ params, searchParams: Promise.resolve({}) })).rejects.toThrow('NOT_FOUND');
        expect(log).toHaveBeenCalled();
        log.mockRestore();
    });
    it('uses complete WIB bounds and passes the same dates to the client', async () => {
        const page = await Page({ params, searchParams: Promise.resolve({ startDate: '2026-07-01', endDate: '2026-07-31' }) });
        expect(fetchLedger).toHaveBeenCalledWith('account', new Date('2026-06-30T17:00:00Z'), new Date('2026-07-31T16:59:59.999Z'));
        expect(page.props.initialDateRange).toEqual({ from: '2026-07-01', to: '2026-07-31' });
        expect(page.key).toBe('account');
    });
    it('defaults to September after midnight WIB while UTC is still August', async () => {
        const page = await Page({ params, searchParams: Promise.resolve({}) });
        expect(page.props.initialDateRange).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    });
    it('shows a clear error and does not fetch on invalid dates', async () => {
        const page = await Page({ params, searchParams: Promise.resolve({ startDate: '2026-02-30' }) });
        expect(page.props.role).toBe('alert');
        expect(fetchLedger).not.toHaveBeenCalled();
    });
});
