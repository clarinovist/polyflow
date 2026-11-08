import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { tenantContext } from '@/lib/core/prisma';
import {
    returnTestClient,
    verifyReturnTestDatabase,
} from '../../finance/__tests__/return-credit-postgres-fixture';
import {
    cancelProposal,
    computeProposalDigest,
    confirmProposal,
    COLLECTION_FOLLOWUP_KIND,
    createCollectionFollowupProposal,
    listPendingProposals,
    PROPOSAL_TTL_MS,
    type AssertInvoiceAccess,
} from '../action-proposal-service';

const connection = process.env.RETURN_CREDIT_TEST_DATABASE_URL;
const db = connection ? returnTestClient(connection) : null;
const run = <T>(fn: () => Promise<T>) => tenantContext.run(db!, fn);

const TENANT = 'synthetic-tenant-a';
const OTHER_TENANT = 'synthetic-tenant-b';
const USER = 'proposal-user';
const OTHER_USER = 'proposal-other-user';
const CONVERSATION = 'synthetic-conversation';
const INVOICE = 'proposal-invoice';
const NOW = new Date('2026-11-08T03:00:00.000Z');
const AFTER_EXPIRY = new Date(NOW.getTime() + PROPOSAL_TTL_MS + 1000);
const CONFIRMED_ACTION = 'ASSISTANT_PROPOSAL_CONFIRMED';

const allowAccess: AssertInvoiceAccess = async () => {};
const basePayload = (overrides: Record<string, unknown> = {}) => ({
    invoiceId: INVOICE,
    type: 'CALL',
    notes: 'SYNTHETIC follow-up note',
    ...overrides,
});

async function seedInvoice(client: PrismaClient, id: string) {
    await client.invoice.create({
        data: {
            id,
            invoiceNumber: `SYNTHETIC-INV-${id}`,
            salesOrderId: 'proposal-order',
            totalAmount: 1000,
            status: 'UNPAID',
        },
    });
}

async function seed(client: PrismaClient) {
    await verifyReturnTestDatabase(client);
    await client.$executeRaw`TRUNCATE "AssistantActionProposal", "CollectionActivity", "Invoice", "SalesOrder", "AuditLog", "User" CASCADE`;
    await client.user.createMany({
        data: [
            { id: USER, email: 'proposal-user@example.invalid', password: 'synthetic-only', role: 'SALES' },
            { id: OTHER_USER, email: 'proposal-other@example.invalid', password: 'synthetic-only', role: 'SALES' },
        ],
    });
    await client.salesOrder.create({ data: { id: 'proposal-order', orderNumber: 'SYNTHETIC-SO-PROPOSAL' } });
    await seedInvoice(client, INVOICE);
}

const propose = (
    payload: unknown = basePayload(),
    overrides: { conversationId?: string; userId?: string; tenantId?: string; now?: Date } = {},
) =>
    run(() =>
        createCollectionFollowupProposal({
            tenantId: overrides.tenantId ?? TENANT,
            userId: overrides.userId ?? USER,
            conversationId: overrides.conversationId ?? CONVERSATION,
            payload,
            assertInvoiceAccess: allowAccess,
            now: overrides.now ?? NOW,
        }),
    );

const confirm = (
    proposalId: string,
    overrides: { userId?: string; tenantId?: string; now?: Date; assertInvoiceAccess?: AssertInvoiceAccess } = {},
) =>
    run(() =>
        confirmProposal({
            proposalId,
            tenantId: overrides.tenantId ?? TENANT,
            userId: overrides.userId ?? USER,
            assertInvoiceAccess: overrides.assertInvoiceAccess ?? allowAccess,
            now: overrides.now ?? NOW,
        }),
    );

const cancel = (proposalId: string, userId = USER) =>
    run(() => cancelProposal({ proposalId, tenantId: TENANT, userId }));

const rawProposal = (data: Record<string, unknown> = {}) => {
    const payload = basePayload({ notes: `raw-${randomUUID()}` });
    return {
        id: randomUUID(),
        tenantId: TENANT,
        userId: USER,
        conversationId: CONVERSATION,
        kind: COLLECTION_FOLLOWUP_KIND,
        payload,
        payloadDigest: computeProposalDigest(TENANT, USER, COLLECTION_FOLLOWUP_KIND, payload),
        status: 'PENDING',
        expiresAt: new Date(NOW.getTime() + PROPOSAL_TTL_MS),
        ...data,
    };
};

const proposalRow = (id: string) => db!.assistantActionProposal.findUniqueOrThrow({ where: { id } });
const activityCount = () => db!.collectionActivity.count();
const confirmedAuditCount = () => db!.auditLog.count({ where: { action: CONFIRMED_ACTION } });

describe.skipIf(!db)('assistant action proposal PostgreSQL contracts', () => {
    beforeEach(async () => seed(db!));
    afterAll(async () => {
        await db?.$disconnect();
    });

    it('proposes idempotently and keeps a confirmed proposal confirmed when proposed again', async () => {
        const first = await propose();
        const second = await propose();
        expect(second.id).toBe(first.id);
        expect(await db!.assistantActionProposal.count()).toBe(1);

        await confirm(first.id);
        const again = await propose();

        expect(again.id).toBe(first.id);
        expect(again.status).toBe('CONFIRMED');
        expect((await proposalRow(first.id)).status).toBe('CONFIRMED');
        expect(await db!.assistantActionProposal.count()).toBe(1);
        expect(await activityCount()).toBe(1);
    });

    it('confirms once: one activity, CONFIRMED proposal pointing at it, and one audit row', async () => {
        const proposal = await propose();

        const result = await confirm(proposal.id);

        const activities = await db!.collectionActivity.findMany();
        expect(activities).toHaveLength(1);
        expect(activities[0]).toMatchObject({ invoiceId: INVOICE, userId: USER, type: 'CALL', notes: 'SYNTHETIC follow-up note' });
        expect(result).toEqual({ proposalId: proposal.id, resultRef: activities[0].id });
        const row = await proposalRow(proposal.id);
        expect(row.status).toBe('CONFIRMED');
        expect(row.resultRef).toBe(activities[0].id);
        expect(row.confirmedAt?.getTime()).toBe(NOW.getTime());
        const audits = await db!.auditLog.findMany({ where: { action: CONFIRMED_ACTION } });
        expect(audits).toHaveLength(1);
        expect(audits[0]).toMatchObject({ userId: USER, entityType: 'CollectionActivity', entityId: activities[0].id });
        expect(audits[0].details).toContain(proposal.id);
    });

    it('lets exactly one of two parallel confirmations win', async () => {
        const proposal = await propose();

        const outcomes = await Promise.allSettled([confirm(proposal.id), confirm(proposal.id)]);

        const fulfilled = outcomes.filter((outcome) => outcome.status === 'fulfilled');
        const rejected = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected');
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect(String(rejected[0].reason?.message)).toContain('PROPOSAL_NOT_CONFIRMABLE');
        expect(await activityCount()).toBe(1);
        expect(await confirmedAuditCount()).toBe(1);
        expect((await proposalRow(proposal.id)).status).toBe('CONFIRMED');
    });

    it('rejects confirmation after the proposal expired and leaves it PENDING', async () => {
        const proposal = await propose();

        await expect(confirm(proposal.id, { now: AFTER_EXPIRY })).rejects.toThrow('PROPOSAL_NOT_CONFIRMABLE:PENDING');

        expect(await activityCount()).toBe(0);
        expect(await confirmedAuditCount()).toBe(0);
        expect((await proposalRow(proposal.id)).status).toBe('PENDING');
    });

    it('does not let another user or another tenant confirm a proposal', async () => {
        const proposal = await propose();

        await expect(confirm(proposal.id, { userId: OTHER_USER })).rejects.toThrow('PROPOSAL_NOT_CONFIRMABLE:NOT_FOUND');
        await expect(confirm(proposal.id, { tenantId: OTHER_TENANT })).rejects.toThrow('PROPOSAL_NOT_CONFIRMABLE:NOT_FOUND');

        expect(await activityCount()).toBe(0);
        expect((await proposalRow(proposal.id)).status).toBe('PENDING');
    });

    it('rolls the claim back when the invoice access check fails after the claim', async () => {
        const proposal = await propose();
        const denyAccess: AssertInvoiceAccess = async () => {
            throw new Error('SYNTHETIC_ACCESS_DENIED');
        };

        await expect(confirm(proposal.id, { assertInvoiceAccess: denyAccess })).rejects.toThrow('SYNTHETIC_ACCESS_DENIED');

        const row = await proposalRow(proposal.id);
        expect(row.status).toBe('PENDING');
        expect(row.confirmedAt).toBeNull();
        expect(await activityCount()).toBe(0);
        expect(await confirmedAuditCount()).toBe(0);
        await expect(confirm(proposal.id)).resolves.toMatchObject({ proposalId: proposal.id });
        expect(await activityCount()).toBe(1);
    });

    it('rolls the claim back when the activity insert fails on a missing invoice, then confirms once the invoice exists', async () => {
        const proposal = await propose(basePayload({ invoiceId: 'late-invoice' }));

        await expect(confirm(proposal.id)).rejects.toThrow();

        const row = await proposalRow(proposal.id);
        expect(row.status).toBe('PENDING');
        expect(row.confirmedAt).toBeNull();
        expect(row.resultRef).toBeNull();
        expect(await activityCount()).toBe(0);
        expect(await db!.auditLog.count()).toBe(0);

        await seedInvoice(db!, 'late-invoice');
        await expect(confirm(proposal.id)).resolves.toMatchObject({ proposalId: proposal.id });
        expect(await activityCount()).toBe(1);
        expect(await confirmedAuditCount()).toBe(1);
        expect((await proposalRow(proposal.id)).status).toBe('CONFIRMED');
    });

    it('cancels a pending proposal once and never lets a decided or foreign proposal change', async () => {
        const pending = await propose();
        expect(await cancel(pending.id, OTHER_USER)).toBe(false);
        expect((await proposalRow(pending.id)).status).toBe('PENDING');

        expect(await cancel(pending.id)).toBe(true);
        expect((await proposalRow(pending.id)).status).toBe('CANCELLED');
        expect(await cancel(pending.id)).toBe(false);
        await expect(confirm(pending.id)).rejects.toThrow('PROPOSAL_NOT_CONFIRMABLE:CANCELLED');

        const confirmed = await propose(basePayload({ notes: 'SYNTHETIC second note' }));
        await confirm(confirmed.id);
        expect(await cancel(confirmed.id)).toBe(false);
        expect((await proposalRow(confirmed.id)).status).toBe('CONFIRMED');
        expect(await activityCount()).toBe(1);
    });

    it('enforces one proposal per conversation and payload digest for writers that bypass the service', async () => {
        const first = rawProposal();
        await db!.assistantActionProposal.create({ data: first as never });

        await expect(
            db!.assistantActionProposal.create({
                data: rawProposal({ conversationId: first.conversationId, payloadDigest: first.payloadDigest }) as never,
            }),
        ).rejects.toMatchObject({ code: 'P2002' });

        await db!.assistantActionProposal.create({
            data: rawProposal({ conversationId: 'other-conversation', payloadDigest: first.payloadDigest }) as never,
        });
        expect(await db!.assistantActionProposal.count()).toBe(2);
    });

    it('lists only the caller live pending proposals of the same tenant', async () => {
        const live = rawProposal({ createdAt: new Date(NOW.getTime() - 1000) });
        await db!.assistantActionProposal.createMany({
            data: [
                live,
                rawProposal({ status: 'CONFIRMED' }),
                rawProposal({ status: 'CANCELLED' }),
                rawProposal({ expiresAt: new Date(NOW.getTime() - 1000) }),
                rawProposal({ userId: OTHER_USER }),
                rawProposal({ tenantId: OTHER_TENANT }),
            ] as never,
        });

        const views = await run(() => listPendingProposals({ tenantId: TENANT, userId: USER, now: NOW }));

        expect(views.map((view) => view.id)).toEqual([live.id]);
        expect(views[0].kind).toBe(COLLECTION_FOLLOWUP_KIND);
        expect(views[0].summary).toContain(`SYNTHETIC-INV-${INVOICE}`);
        expect(views[0].expiresAt).toBe(live.expiresAt.toISOString());
        expect(await run(() => listPendingProposals({ tenantId: TENANT, userId: USER, now: AFTER_EXPIRY }))).toEqual([]);
    });
});
