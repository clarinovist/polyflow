import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/finance/reports/GeneralLedgerClient', () => ({
    GeneralLedgerClient: () => null,
}));

import GeneralLedgerPage from '../page';

describe('GeneralLedgerPage', () => {
    it('keys the client by validated account and cutoff query', async () => {
        const first = await GeneralLedgerPage({
            searchParams: Promise.resolve({
                account: 'acc-ap',
                to: '2026-09-08',
            }),
        });
        const second = await GeneralLedgerPage({
            searchParams: Promise.resolve({
                account: 'acc-ar',
                to: '2026-09-09',
            }),
        });

        expect(first.key).toBe('acc-ap:2026-09-08');
        expect(second.key).toBe('acc-ar:2026-09-09');
        expect(second.key).not.toBe(first.key);
    });
});
