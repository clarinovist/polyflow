import { describe, expect, it, vi } from 'vitest';
import { Prisma, type PrismaClient } from '@prisma/client';
import { attributeOperationalOpening, OPENING_ATTRIBUTION_ACTION, type OpeningAttributionRequest } from '../operational-opening-attribution';
import { parseOpeningAttributionArgs } from '../../../../scripts/attribute-operational-opening';

const d = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);
const request: OpeningAttributionRequest = { database: 'synthetic_test', actorId: 'system', reason: 'Finance-approved opening attribution',
    targetAccountCode: 'T-134', clearingAccountCode: 'S-199' };
const row = (skuCode: string, stock: number, funded: number, opening: number, extra: Record<string, unknown> = {}) => ({
    id: `v-${skuCode}`, skuCode, name: skuCode, movementId: `ob-${skuCode}`, openingCount: BigInt(1), openingValue: d(opening), openingCosted: true,
    stockValue: d(stock), funded: d(funded), ...extra });
function fixture() {
    const state = {
        identity: 'synthetic_test', role: 'FINANCE', balance: d(100000), period: { id: 'p' } as unknown,
        rows: [row('A', 136797.29, 75493.25, 58108.1), row('B', 35250, 0, 35250), row('C', 40000, 40000, 0, { openingValue: d(0) }),
            row('D', 5000, 0, 9000, { openingCount: BigInt(2) })],
        accounts: [
            { id: 't', code: 'T-134', isActive: true, type: 'ASSET', category: 'CURRENT_ASSET', currency: 'IDR', isCashAccount: false },
            { id: 's', code: 'S-199', isActive: true, type: 'ASSET', category: 'CURRENT_ASSET', currency: 'IDR', isCashAccount: false },
        ],
    };
    let journal = 0;
    const tx = {
        $executeRaw: vi.fn(async (_q: TemplateStringsArray) => 0),
        $queryRaw: vi.fn(async (q: TemplateStringsArray) => {
            const sql = q.join('?');
            if (sql.includes('current_database')) return [{ name: state.identity }];
            if (sql.includes('FOR UPDATE')) return [];
            return state.rows;
        }),
        user: { findUnique: vi.fn(async () => ({ role: state.role })) },
        account: { findMany: vi.fn(async () => state.accounts) },
        journalLine: { aggregate: vi.fn(async () => ({ _sum: { debit: state.balance, credit: d(0) } })) },
        fiscalPeriod: { findFirst: vi.fn(async () => state.period) },
        journalEntry: { create: vi.fn(async (_args: unknown) => ({ id: `j${++journal}` })) },
        auditLog: { create: vi.fn(async (_args: unknown) => ({ id: 'audit' })) },
    };
    const db = { $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)) } as unknown as PrismaClient;
    return { db, tx, state };
}
type Created = { data: { referenceId: string | null; lines: { create: Array<{ accountId: string; debit: Prisma.Decimal.Value; credit: Prisma.Decimal.Value }> } } };

describe('operational opening attribution', () => {
    it('previews read-only: attributes the unfunded stock value up to the SKU opening value', async () => {
        const { db, tx } = fixture();
        const result = await attributeOperationalOpening(db, request);
        expect(result).toMatchObject({ changed: false, total: '93358.1', targetAccount: 'T-134', clearingAccount: 'S-199' });
        expect(result.eligible.map(r => [r.skuCode, r.amount])).toEqual([['A', '58108.1'], ['B', '35250']]);
        expect(result.skipped.map(r => r.skuCode)).toEqual(['C', 'D']);
        expect(tx.$executeRaw.mock.calls[0][0].join('')).toContain('READ ONLY');
        expect(tx.journalEntry.create).not.toHaveBeenCalled();
    });
    it('posts SKU-linked attribution and one unlinked reversal that leave both balances unchanged', async () => {
        const { db, tx } = fixture();
        const { fingerprint } = await attributeOperationalOpening(db, request);
        const applied = await attributeOperationalOpening(db, { ...request, expectedFingerprint: fingerprint, backupReference: 'verified-backup' }, true);
        expect(applied).toMatchObject({ changed: true, auditId: 'audit', journalIds: ['j1', 'j2', 'j3'] });
        const created = tx.journalEntry.create.mock.calls.map(c => (c[0] as Created).data);
        expect(created.map(j => j.referenceId)).toEqual(['ob-A', 'ob-B', null]);
        const net = new Map<string, Prisma.Decimal>();
        for (const line of created.flatMap(j => j.lines.create)) net.set(line.accountId, (net.get(line.accountId) ?? d(0)).plus(line.debit).minus(line.credit));
        expect([...net.values()].every(v => v.isZero())).toBe(true);
        expect(tx.auditLog.create.mock.calls[0][0]).toMatchObject({ data: { action: OPENING_ATTRIBUTION_ACTION, dedupeKey: `${OPENING_ATTRIBUTION_ACTION}:${fingerprint}` } });
        expect(tx.$queryRaw.mock.calls.some(c => c[0].join('?').includes('FOR UPDATE'))).toBe(true);
    });
    it('fails closed on drift, missing approval evidence, wrong target, actor, accounts, period and balance', async () => {
        const { db, state } = fixture();
        const { fingerprint } = await attributeOperationalOpening(db, request);
        state.rows = state.rows.slice(1);
        await expect(attributeOperationalOpening(db, { ...request, expectedFingerprint: fingerprint, backupReference: 'b' }, true)).rejects.toThrow('Data berubah');
        await expect(attributeOperationalOpening(db, { ...request, expectedFingerprint: fingerprint }, true)).rejects.toThrow('backup');
        await expect(attributeOperationalOpening(db, { ...request, reason: 'short' })).rejects.toThrow('wajib');
        await expect(attributeOperationalOpening(db, { ...request, clearingAccountCode: 'T-134' })).rejects.toThrow('berbeda');
        for (const [mutate, message] of [
            [() => { state.identity = 'other'; }, 'Database'],
            [() => { state.role = 'WAREHOUSE'; }, 'Aktor'],
            [() => { state.accounts[0] = { ...state.accounts[0], isCashAccount: true }; }, 'persediaan'],
            [() => { state.accounts[1] = { ...state.accounts[1], isActive: false }; }, 'perantara'],
            [() => { state.period = null; }, 'OPEN'],
            [() => { state.balance = d(1000); }, 'melebihi'],
        ] as const) {
            const fresh = fixture(); Object.assign(state, fresh.state); mutate();
            await expect(attributeOperationalOpening(db, { ...request, actorId: state.role === 'WAREHOUSE' ? 'u' : 'system' })).rejects.toThrow(message);
        }
    });
    it('does nothing when every opening is already attributed', async () => {
        const { db, state, tx } = fixture(); state.rows = [];
        const { fingerprint } = await attributeOperationalOpening(db, request);
        expect(await attributeOperationalOpening(db, { ...request, expectedFingerprint: fingerprint, backupReference: 'b' }, true)).toMatchObject({ changed: false, total: '0' });
        expect(tx.journalEntry.create).not.toHaveBeenCalled();
    });
});

describe('opening attribution CLI arguments', () => {
    const base = ['--tenant=synthetic', '--database=synthetic_test', '--actor-id=system', '--reason=Finance-approved attribution', '--target-account=1-134', '--clearing-account=1-199'];
    it('parses preview and confirmed execute modes', () => {
        expect(parseOpeningAttributionArgs(base)).toMatchObject({ tenant: 'synthetic', execute: false, request: { targetAccountCode: '1-134', clearingAccountCode: '1-199' } });
        expect(parseOpeningAttributionArgs([...base, '--execute', '--yes', `--fingerprint=${'a'.repeat(64)}`, '--backup=bk'])).toMatchObject({ execute: true, request: { backupReference: 'bk' } });
    });
    it('rejects ambiguous or unconfirmed arguments', () => {
        expect(() => parseOpeningAttributionArgs([...base, '--execute'])).toThrow('--yes');
        expect(() => parseOpeningAttributionArgs([...base, '--tenant=other'])).toThrow('Exactly one');
    });
});
