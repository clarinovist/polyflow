import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const mocks = vi.hoisted(() => {
    const tx = {
        $queryRaw: vi.fn(),
        expenseClaim: {
            count: vi.fn(),
            create: vi.fn(),
            findFirst: vi.fn(),
            findUnique: vi.fn(),
            findUniqueOrThrow: vi.fn(),
            updateMany: vi.fn(),
        },
    };
    const db = {
        $transaction: vi.fn(),
        expenseClaim: { findFirst: vi.fn() },
        salesVisit: { findFirst: vi.fn() },
    };
    return { tx, db, audit: vi.fn() };
});

vi.mock('@/lib/core/prisma', () => ({ prisma: mocks.db }));
vi.mock('@/lib/tools/audit', () => ({ logActivity: mocks.audit }));

import { CLAIM_NUMBER_MAX_ATTEMPTS } from '../expense-claim-number';
import {
    approveClaim,
    cancelClaim,
    rejectClaim,
    submitClaim,
} from '../expense-claim-service';

const NOW = new Date('2026-11-24T05:00:00Z'); // 24 Nov 2026 12:00 WIB
const TENANT = 'acme';
const USER = 'user-1';
const MANAGER = { id: 'mgr-1', isAdmin: false };
const ADMIN = { id: 'adm-1', isAdmin: true };
const RECEIPT = `/api/images/${TENANT}/expense-receipt/${USER}/1700000000000.jpg`;
const validInput = {
    expenseDate: '2026-11-24',
    category: 'BBM',
    amount: 50000,
    description: 'Bensin ke pelanggan',
    receiptUrl: RECEIPT,
};
const stored = (overrides: Record<string, unknown> = {}) => ({
    id: 'claim-1',
    claimNumber: 'RMB-202611-001',
    userId: USER,
    status: 'SUBMITTED',
    ...overrides,
});
const p2002 = (target: unknown) =>
    new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target },
    });

beforeEach(() => {
    vi.resetAllMocks();
    mocks.db.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(mocks.tx));
    mocks.db.expenseClaim.findFirst.mockResolvedValue(null);
    mocks.db.salesVisit.findFirst.mockResolvedValue({ id: 'visit-1' });
    mocks.tx.$queryRaw.mockResolvedValue([{ locked: 1 }]);
    mocks.tx.expenseClaim.findFirst.mockResolvedValue(null);
    mocks.tx.expenseClaim.count.mockResolvedValue(0);
    mocks.tx.expenseClaim.create.mockImplementation(async ({ data }) => ({ id: 'claim-1', ...data }));
    mocks.tx.expenseClaim.findUnique.mockResolvedValue(stored());
    mocks.tx.expenseClaim.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.expenseClaim.findUniqueOrThrow.mockResolvedValue({ id: 'claim-1' });
});

describe('submitClaim', () => {
    it('creates a SUBMITTED claim with a WIB-month number and audits inside the transaction', async () => {
        const claim = await submitClaim(USER, { ...validInput, salesVisitId: 'visit-1' }, { tenant: TENANT }, NOW);

        expect(mocks.tx.expenseClaim.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    claimNumber: 'RMB-202611-001',
                    userId: USER,
                    salesVisitId: 'visit-1',
                    category: 'BBM',
                    amount: 50000,
                    receiptUrl: RECEIPT,
                    clientClaimId: null,
                    expenseDate: new Date('2026-11-23T17:00:00.000Z'),
                }),
            }),
        );
        expect(claim.id).toBe('claim-1');
        expect(mocks.audit).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: USER,
                action: 'SUBMIT_EXPENSE_CLAIM',
                entityType: 'ExpenseClaim',
                entityId: 'claim-1',
                toStatus: 'SUBMITTED',
                tx: mocks.tx,
            }),
        );
    });

    it('returns the stored claim for a repeated clientClaimId instead of creating a duplicate', async () => {
        const existing = { id: 'existing', claimNumber: 'RMB-202611-009' };
        mocks.db.expenseClaim.findFirst.mockResolvedValue(existing);

        const claim = await submitClaim(USER, { ...validInput, clientClaimId: 'offline-1' }, { tenant: TENANT }, NOW);

        expect(claim).toBe(existing);
        expect(mocks.db.expenseClaim.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({ where: { userId: USER, clientClaimId: 'offline-1' } }),
        );
        expect(mocks.tx.expenseClaim.create).not.toHaveBeenCalled();
    });

    it('still replays an old claim by clientClaimId even if the date window has since passed', async () => {
        mocks.db.expenseClaim.findFirst.mockResolvedValue({ id: 'existing' });
        const late = new Date('2027-03-01T05:00:00Z');
        await expect(
            submitClaim(USER, { ...validInput, clientClaimId: 'offline-1' }, { tenant: TENANT }, late),
        ).resolves.toEqual({ id: 'existing' });
    });

    it.each([
        ['zero amount', { amount: 0 }],
        ['negative amount', { amount: -1 }],
        ['blank description', { description: '  ' }],
        ['description over 500 characters', { description: 'x'.repeat(501) }],
        ['unknown category', { category: 'ROKOK' }],
    ])('rejects %s before touching the database', async (_label, patch) => {
        await expect(
            submitClaim(USER, { ...validInput, ...patch }, { tenant: TENANT }, NOW),
        ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
        expect(mocks.db.$transaction).not.toHaveBeenCalled();
        expect(mocks.db.salesVisit.findFirst).not.toHaveBeenCalled();
    });

    it('rejects an expense date in the future (WIB)', async () => {
        await expect(
            submitClaim(USER, { ...validInput, expenseDate: '2026-11-25' }, { tenant: TENANT }, NOW),
        ).rejects.toMatchObject({ code: 'EXPENSE_DATE_IN_FUTURE' });
        expect(mocks.tx.expenseClaim.create).not.toHaveBeenCalled();
    });

    it('rejects an expense date older than 90 days', async () => {
        await expect(
            submitClaim(USER, { ...validInput, expenseDate: '2026-08-01' }, { tenant: TENANT }, NOW),
        ).rejects.toMatchObject({ code: 'EXPENSE_DATE_TOO_OLD' });
    });

    it('rejects a receipt already used by a SUBMITTED, APPROVED or PAID claim', async () => {
        mocks.tx.expenseClaim.findFirst.mockImplementation(async ({ where }) =>
            where.receiptUrl ? { id: 'other-claim' } : null,
        );

        await expect(submitClaim(USER, validInput, { tenant: TENANT }, NOW)).rejects.toMatchObject({
            code: 'DUPLICATE_RECEIPT',
        });
        expect(mocks.tx.expenseClaim.findFirst).toHaveBeenCalledWith({
            where: {
                receiptUrl: RECEIPT,
                status: { in: ['SUBMITTED', 'APPROVED', 'PAID'] },
            },
            select: { id: true },
        });
        expect(mocks.tx.expenseClaim.create).not.toHaveBeenCalled();
    });

    it('allows reusing a receipt whose earlier claim was cancelled or rejected', async () => {
        const claim = await submitClaim(USER, validInput, { tenant: TENANT }, NOW);
        expect(claim.id).toBe('claim-1');
        const duplicateLookup = mocks.tx.expenseClaim.findFirst.mock.calls.find(([a]) => a.where.receiptUrl);
        expect(duplicateLookup?.[0].where.status.in).not.toContain('CANCELLED');
        expect(duplicateLookup?.[0].where.status.in).not.toContain('REJECTED');
    });

    it('replays by clientClaimId before the duplicate-receipt check', async () => {
        const existing = { id: 'existing' };
        mocks.db.expenseClaim.findFirst.mockImplementation(async ({ where }) =>
            where.clientClaimId ? existing : { id: 'same-receipt-claim' },
        );
        mocks.tx.expenseClaim.findFirst.mockResolvedValue({ id: 'same-receipt-claim' });

        await expect(
            submitClaim(USER, { ...validInput, clientClaimId: 'offline-1' }, { tenant: TENANT }, NOW),
        ).resolves.toBe(existing);
        expect(mocks.db.$transaction).not.toHaveBeenCalled();
    });

    it('takes a per-receipt advisory lock inside the transaction before the duplicate check and the create', async () => {
        await submitClaim(USER, validInput, { tenant: TENANT }, NOW);

        expect(mocks.tx.$queryRaw).toHaveBeenCalledTimes(1);
        const [strings, key] = mocks.tx.$queryRaw.mock.calls[0];
        expect(strings.join('?')).toContain('pg_advisory_xact_lock(hashtextextended(');
        expect(key).toBe(`expense-claim-receipt:${RECEIPT}`);
        const lockOrder = mocks.tx.$queryRaw.mock.invocationCallOrder[0];
        const duplicateOrder = mocks.tx.expenseClaim.findFirst.mock.invocationCallOrder[0];
        const createOrder = mocks.tx.expenseClaim.create.mock.invocationCallOrder[0];
        expect(lockOrder).toBeLessThan(duplicateOrder);
        expect(duplicateOrder).toBeLessThan(createOrder);
    });

    it('checks duplicates only inside the transaction, never on the pool client', async () => {
        await submitClaim(USER, validInput, { tenant: TENANT }, NOW);

        const poolLookups = mocks.db.expenseClaim.findFirst.mock.calls.filter(([a]) => a.where.receiptUrl);
        expect(poolLookups).toHaveLength(0);
        expect(mocks.tx.expenseClaim.findFirst).toHaveBeenCalledTimes(1);
    });

    it('does not create a claim and does not retry when the duplicate is found after the lock', async () => {
        mocks.tx.expenseClaim.findFirst.mockResolvedValue({ id: 'winner-of-the-race' });

        await expect(submitClaim(USER, validInput, { tenant: TENANT }, NOW)).rejects.toMatchObject({
            code: 'DUPLICATE_RECEIPT',
        });
        expect(mocks.db.$transaction).toHaveBeenCalledTimes(1);
        expect(mocks.tx.expenseClaim.create).not.toHaveBeenCalled();
        expect(mocks.audit).not.toHaveBeenCalled();
    });

    it('replays a racing retry of the same clientClaimId after the lock instead of reporting a duplicate receipt', async () => {
        const stored = { id: 'first-attempt' };
        mocks.tx.expenseClaim.findFirst.mockImplementation(async ({ where }) =>
            where.clientClaimId ? stored : { id: 'first-attempt' },
        );

        await expect(
            submitClaim(USER, { ...validInput, clientClaimId: 'offline-1' }, { tenant: TENANT }, NOW),
        ).resolves.toBe(stored);
        expect(mocks.tx.expenseClaim.create).not.toHaveBeenCalled();
        const receiptLookups = mocks.tx.expenseClaim.findFirst.mock.calls.filter(([a]) => a.where.receiptUrl);
        expect(receiptLookups).toHaveLength(0);
    });

    it('rejects a visit that belongs to someone else', async () => {
        mocks.db.salesVisit.findFirst.mockResolvedValue(null);

        await expect(
            submitClaim(USER, { ...validInput, salesVisitId: 'visit-9' }, { tenant: TENANT }, NOW),
        ).rejects.toMatchObject({ code: 'VISIT_NOT_OWNED' });
        expect(mocks.db.salesVisit.findFirst).toHaveBeenCalledWith({
            where: { id: 'visit-9', userId: USER },
            select: { id: true },
        });
        expect(mocks.tx.expenseClaim.create).not.toHaveBeenCalled();
    });

    it.each([
        ['another user', `/api/images/${TENANT}/expense-receipt/other/1700000000000.jpg`],
        ['another tenant', `/api/images/zzz/expense-receipt/${USER}/1700000000000.jpg`],
        ['an external host', `https://evil.example/api/images/${TENANT}/expense-receipt/${USER}/1.jpg`],
        ['a different upload folder', `/api/images/${TENANT}/remittance-proof/${USER}/1.jpg`],
    ])('rejects a receipt URL pointing at %s', async (_label, receiptUrl) => {
        await expect(
            submitClaim(USER, { ...validInput, receiptUrl }, { tenant: TENANT }, NOW),
        ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
        expect(mocks.tx.expenseClaim.create).not.toHaveBeenCalled();
    });

    it('retries with a fresh number when claimNumber collides', async () => {
        mocks.tx.expenseClaim.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
        mocks.tx.expenseClaim.create
            .mockRejectedValueOnce(p2002(['claimNumber']))
            .mockImplementationOnce(async ({ data }) => ({ id: 'claim-2', ...data }));

        const claim = await submitClaim(USER, validInput, { tenant: TENANT }, NOW);

        expect(mocks.tx.expenseClaim.create).toHaveBeenCalledTimes(2);
        expect(claim).toMatchObject({ id: 'claim-2', claimNumber: 'RMB-202611-002' });
    });

    it('gives up with a clear error after repeated claimNumber collisions', async () => {
        mocks.tx.expenseClaim.create.mockRejectedValue(p2002(['claimNumber']));

        await expect(submitClaim(USER, validInput, { tenant: TENANT }, NOW)).rejects.toMatchObject({
            code: 'CLAIM_NUMBER_ALLOCATION_FAILED',
        });
        expect(mocks.tx.expenseClaim.create).toHaveBeenCalledTimes(CLAIM_NUMBER_MAX_ATTEMPTS);
    });

    it('returns the winner when a concurrent submit with the same clientClaimId wins the race', async () => {
        const winner = { id: 'winner' };
        let clientLookups = 0;
        mocks.db.expenseClaim.findFirst.mockImplementation(async ({ where }) =>
            where.clientClaimId && ++clientLookups > 1 ? winner : null,
        );
        mocks.tx.expenseClaim.create.mockRejectedValue(p2002(['userId', 'clientClaimId']));

        await expect(
            submitClaim(USER, { ...validInput, clientClaimId: 'offline-1' }, { tenant: TENANT }, NOW),
        ).resolves.toBe(winner);
        expect(mocks.tx.expenseClaim.create).toHaveBeenCalledTimes(1);
    });

    it('rethrows a clientClaimId collision when no stored claim can be found, and unrelated errors', async () => {
        const collision = p2002(['userId', 'clientClaimId']);
        mocks.tx.expenseClaim.create.mockRejectedValueOnce(collision);
        await expect(
            submitClaim(USER, { ...validInput, clientClaimId: 'offline-1' }, { tenant: TENANT }, NOW),
        ).rejects.toBe(collision);

        const boom = new Error('db down');
        mocks.tx.expenseClaim.create.mockRejectedValueOnce(boom);
        await expect(submitClaim(USER, validInput, { tenant: TENANT }, NOW)).rejects.toBe(boom);
    });
});

describe('cancelClaim', () => {
    it('lets the owner cancel a SUBMITTED claim with a compare-and-set update', async () => {
        await cancelClaim('claim-1', USER);

        expect(mocks.tx.expenseClaim.updateMany).toHaveBeenCalledWith({
            where: { id: 'claim-1', userId: USER, status: 'SUBMITTED' },
            data: { status: 'CANCELLED' },
        });
        expect(mocks.audit).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'CANCEL_EXPENSE_CLAIM',
                fromStatus: 'SUBMITTED',
                toStatus: 'CANCELLED',
                tx: mocks.tx,
            }),
        );
    });

    it('hides the claim from a non-owner as not found', async () => {
        await expect(cancelClaim('claim-1', 'someone-else')).rejects.toMatchObject({ code: 'NOT_FOUND' });
        expect(mocks.tx.expenseClaim.updateMany).not.toHaveBeenCalled();
    });

    it('reports not found for a missing claim', async () => {
        mocks.tx.expenseClaim.findUnique.mockResolvedValue(null);
        await expect(cancelClaim('nope', USER)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it.each(['APPROVED', 'REJECTED', 'PAID', 'CANCELLED'])('refuses to cancel a %s claim', async (status) => {
        mocks.tx.expenseClaim.findUnique.mockResolvedValue(stored({ status }));
        await expect(cancelClaim('claim-1', USER)).rejects.toMatchObject({
            code: 'INVALID_EXPENSE_CLAIM_STATUS',
        });
        expect(mocks.tx.expenseClaim.updateMany).not.toHaveBeenCalled();
    });

    it('reports STALE_STATUS and does not audit when the compare-and-set matches no row', async () => {
        mocks.tx.expenseClaim.updateMany.mockResolvedValue({ count: 0 });
        await expect(cancelClaim('claim-1', USER)).rejects.toMatchObject({ code: 'STALE_STATUS' });
        expect(mocks.audit).not.toHaveBeenCalled();
    });
});

describe('approveClaim', () => {
    it('approves with a compare-and-set on SUBMITTED and audits inside the transaction', async () => {
        await approveClaim('claim-1', MANAGER, NOW);

        expect(mocks.tx.expenseClaim.updateMany).toHaveBeenCalledWith({
            where: { id: 'claim-1', status: 'SUBMITTED' },
            data: { status: 'APPROVED', reviewedById: 'mgr-1', reviewedAt: NOW, rejectionReason: null },
        });
        expect(mocks.audit).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: 'mgr-1',
                action: 'APPROVE_EXPENSE_CLAIM',
                fromStatus: 'SUBMITTED',
                toStatus: 'APPROVED',
                tx: mocks.tx,
            }),
        );
        expect(mocks.tx.expenseClaim.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
            mocks.audit.mock.invocationCallOrder[0],
        );
    });

    it('reports STALE_STATUS when another reviewer already changed the claim', async () => {
        mocks.tx.expenseClaim.updateMany.mockResolvedValue({ count: 0 });
        await expect(approveClaim('claim-1', MANAGER)).rejects.toMatchObject({ code: 'STALE_STATUS' });
        expect(mocks.audit).not.toHaveBeenCalled();
    });

    it('refuses a non-admin reviewing their own claim', async () => {
        mocks.tx.expenseClaim.findUnique.mockResolvedValue(stored({ userId: 'mgr-1' }));
        await expect(approveClaim('claim-1', MANAGER)).rejects.toMatchObject({
            code: 'SELF_APPROVAL_NOT_ALLOWED',
        });
        expect(mocks.tx.expenseClaim.updateMany).not.toHaveBeenCalled();
    });

    it('lets an ADMIN review their own claim', async () => {
        mocks.tx.expenseClaim.findUnique.mockResolvedValue(stored({ userId: 'adm-1' }));
        await expect(approveClaim('claim-1', ADMIN)).resolves.toBeDefined();
        expect(mocks.tx.expenseClaim.updateMany).toHaveBeenCalledTimes(1);
    });

    it('reports not found for a missing claim', async () => {
        mocks.tx.expenseClaim.findUnique.mockResolvedValue(null);
        await expect(approveClaim('nope', MANAGER)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it.each(['APPROVED', 'REJECTED', 'PAID', 'CANCELLED'])('refuses to review a %s claim', async (status) => {
        mocks.tx.expenseClaim.findUnique.mockResolvedValue(stored({ status }));
        await expect(approveClaim('claim-1', MANAGER)).rejects.toMatchObject({
            code: 'INVALID_EXPENSE_CLAIM_STATUS',
        });
        expect(mocks.tx.expenseClaim.updateMany).not.toHaveBeenCalled();
    });
});

describe('rejectClaim', () => {
    it('stores the trimmed reason and audits the rejection', async () => {
        await rejectClaim('claim-1', MANAGER, '  Nota tidak jelas  ', NOW);

        expect(mocks.tx.expenseClaim.updateMany).toHaveBeenCalledWith({
            where: { id: 'claim-1', status: 'SUBMITTED' },
            data: {
                status: 'REJECTED',
                reviewedById: 'mgr-1',
                reviewedAt: NOW,
                rejectionReason: 'Nota tidak jelas',
            },
        });
        expect(mocks.audit).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'REJECT_EXPENSE_CLAIM',
                toStatus: 'REJECTED',
                details: expect.stringContaining('Nota tidak jelas'),
                tx: mocks.tx,
            }),
        );
    });

    it.each(['', '   ', 'ab', 'x'.repeat(301)])('rejects an invalid reason %j before any database access', async (reason) => {
        await expect(rejectClaim('claim-1', MANAGER, reason)).rejects.toMatchObject({
            code: 'VALIDATION_ERROR',
        });
        expect(mocks.db.$transaction).not.toHaveBeenCalled();
    });

    it('applies the self-review block and the stale check to rejection as well', async () => {
        mocks.tx.expenseClaim.findUnique.mockResolvedValue(stored({ userId: 'mgr-1' }));
        await expect(rejectClaim('claim-1', MANAGER, 'alasan')).rejects.toMatchObject({
            code: 'SELF_APPROVAL_NOT_ALLOWED',
        });

        mocks.tx.expenseClaim.findUnique.mockResolvedValue(stored());
        mocks.tx.expenseClaim.updateMany.mockResolvedValue({ count: 0 });
        await expect(rejectClaim('claim-1', MANAGER, 'alasan')).rejects.toMatchObject({
            code: 'STALE_STATUS',
        });
    });
});
