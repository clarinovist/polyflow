'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/core/prisma';
import { withTenant } from '@/lib/core/tenant';
import { requireAuth } from '@/lib/tools/auth-checks';
import { resolveAllowedResources } from '@/lib/telegram/permissions';
import { serializeData } from '@/lib/utils/utils';
import { safeAction } from '@/lib/errors/errors';
import {
    NotFoundError,
    ConflictError,
    BusinessRuleError,
} from '@/lib/errors/errors';
import type { FindingStatus } from '@prisma/client';

const DEFAULT_LIST_STATUSES: FindingStatus[] = [
    'UNCLAIMED',
    'CLAIMED',
    'SNOOZED',
];

async function assertCanActOnFinding(
    userId: string,
    requiredResources: string[],
) {
    const allowed = await resolveAllowedResources(userId);
    if (allowed === 'ALL') return;
    const hasAccess = requiredResources.some((r) => allowed.includes(r));
    if (!hasAccess) {
        throw new BusinessRuleError(
            'Anda tidak memiliki izin untuk temuan ini.',
        );
    }
}

export const listMyFindings = withTenant(async function listMyFindings(opts?: {
    statuses?: FindingStatus[];
}) {
    return safeAction(async () => {
        const session = await requireAuth();
        const allowed = await resolveAllowedResources(session.user.id);
        const statuses = opts?.statuses ?? DEFAULT_LIST_STATUSES;

        const findings = await prisma.finding.findMany({
            where: {
                status: { in: statuses },
                ...(allowed === 'ALL'
                    ? {}
                    : { requiredResources: { hasSome: allowed } }),
            },
            orderBy: [{ severity: 'desc' }, { firstSeenAt: 'asc' }],
            include: {
                claimedBy: { select: { id: true, name: true, email: true } },
                resolvedBy: { select: { id: true, name: true, email: true } },
            },
        });

        return serializeData(findings);
    });
});

export const claimFinding = withTenant(async function claimFinding(
    findingId: string,
) {
    return safeAction(async () => {
        const session = await requireAuth();

        const finding = await prisma.finding.findUnique({
            where: { id: findingId },
            select: { requiredResources: true },
        });
        if (!finding) throw new NotFoundError('Temuan', findingId);
        await assertCanActOnFinding(session.user.id, finding.requiredResources);

        const result = await prisma.$transaction(async (tx) => {
            const { count } = await tx.finding.updateMany({
                where: { id: findingId, status: 'UNCLAIMED' },
                data: {
                    status: 'CLAIMED',
                    claimedById: session.user.id,
                    claimedAt: new Date(),
                },
            });
            if (count === 0) {
                throw new ConflictError(
                    'Temuan ini sudah diklaim orang lain atau sudah selesai.',
                );
            }
            await tx.findingEvent.create({
                data: {
                    findingId,
                    action: 'CLAIMED',
                    actorId: session.user.id,
                    fromStatus: 'UNCLAIMED',
                    toStatus: 'CLAIMED',
                },
            });
            return tx.finding.findUniqueOrThrow({ where: { id: findingId } });
        });

        revalidatePath('/findings');
        return serializeData(result);
    });
});

export const resolveFinding = withTenant(async function resolveFinding(
    findingId: string,
    note?: string,
) {
    return safeAction(async () => {
        const session = await requireAuth();

        const finding = await prisma.finding.findUnique({
            where: { id: findingId },
            select: { status: true, requiredResources: true },
        });
        if (!finding) throw new NotFoundError('Temuan', findingId);
        if (finding.status === 'RESOLVED') {
            throw new ConflictError('Temuan ini sudah selesai.');
        }
        await assertCanActOnFinding(session.user.id, finding.requiredResources);

        const result = await prisma.$transaction(async (tx) => {
            const updated = await tx.finding.update({
                where: { id: findingId },
                data: {
                    status: 'RESOLVED',
                    resolvedById: session.user.id,
                    resolvedAt: new Date(),
                    resolutionNote: note?.trim() || null,
                    autoResolved: false,
                },
            });
            await tx.findingEvent.create({
                data: {
                    findingId,
                    action: 'RESOLVED',
                    actorId: session.user.id,
                    fromStatus: finding.status,
                    toStatus: 'RESOLVED',
                    note: note?.trim() || undefined,
                },
            });
            return updated;
        });

        revalidatePath('/findings');
        return serializeData(result);
    });
});

const MIN_SNOOZE_DAYS = 1;
const MAX_SNOOZE_DAYS = 14;

export const snoozeFinding = withTenant(async function snoozeFinding(
    findingId: string,
    days: number,
) {
    return safeAction(async () => {
        const session = await requireAuth();

        if (
            !Number.isFinite(days) ||
            days < MIN_SNOOZE_DAYS ||
            days > MAX_SNOOZE_DAYS
        ) {
            throw new BusinessRuleError(
                `Durasi snooze harus antara ${MIN_SNOOZE_DAYS}-${MAX_SNOOZE_DAYS} hari.`,
            );
        }

        const finding = await prisma.finding.findUnique({
            where: { id: findingId },
            select: { status: true, requiredResources: true },
        });
        if (!finding) throw new NotFoundError('Temuan', findingId);
        if (finding.status === 'RESOLVED') {
            throw new ConflictError('Temuan ini sudah selesai.');
        }
        await assertCanActOnFinding(session.user.id, finding.requiredResources);

        const snoozedUntil = new Date();
        snoozedUntil.setDate(snoozedUntil.getDate() + days);

        const result = await prisma.$transaction(async (tx) => {
            const updated = await tx.finding.update({
                where: { id: findingId },
                data: { status: 'SNOOZED', snoozedUntil },
            });
            await tx.findingEvent.create({
                data: {
                    findingId,
                    action: 'SNOOZED',
                    actorId: session.user.id,
                    fromStatus: finding.status,
                    toStatus: 'SNOOZED',
                    note: `${days} hari`,
                },
            });
            return updated;
        });

        revalidatePath('/findings');
        return serializeData(result);
    });
});
