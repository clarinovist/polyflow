'use server';

import { auth } from '@/auth';
import { getMainPrisma } from '@/lib/core/prisma';
import { Prisma } from '@prisma/client';
import { ValidationError } from '@/lib/errors/errors';

async function requireSuperAdmin() {
    const session = await auth();
    if (
        !session?.user ||
        !(session.user as { isSuperAdmin?: boolean }).isSuperAdmin
    ) {
        throw new ValidationError('Only super-admin can manage feature proposals.');
    }
    return session;
}

export interface ListSignalClustersParams {
    page?: number;
    limit?: number;
    status?: string;
    q?: string;
}

export async function listFeatureSignalClusters(params: ListSignalClustersParams = {}) {
    await requireSuperAdmin();
    const mainDb = getMainPrisma();

    const { page = 1, limit = 20, status, q } = params;
    const where: Prisma.FeatureSignalClusterWhereInput = {};
    if (status) where.status = status as never;
    if (q) where.canonicalRequest = { contains: q, mode: "insensitive" };

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
        mainDb.featureSignalCluster.findMany({
            where,
            orderBy: [{ uniqueUsers: "desc" }, { lastSeenAt: "desc" }],
            skip,
            take: limit,
        }),
        mainDb.featureSignalCluster.count({ where }),
    ]);

    return { items, total, page, limit };
}

export async function ignoreFeatureSignalCluster(id: string) {
    await requireSuperAdmin();
    const mainDb = getMainPrisma();
    return mainDb.featureSignalCluster.update({
        where: { id },
        data: { status: "IGNORED" },
    });
}

export async function reopenFeatureSignalCluster(id: string) {
    await requireSuperAdmin();
    const mainDb = getMainPrisma();
    return mainDb.featureSignalCluster.update({
        where: { id },
        data: { status: "OPEN" },
    });
}

export interface ListProposalsParams {
    page?: number;
    limit?: number;
    status?: string;
}

export async function listFeatureProposals(params: ListProposalsParams = {}) {
    await requireSuperAdmin();
    const mainDb = getMainPrisma();

    const { page = 1, limit = 20, status } = params;
    const where: Prisma.FeatureProposalWhereInput = {};
    if (status) where.status = status as never;

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
        mainDb.featureProposal.findMany({
            where,
            include: { cluster: true },
            orderBy: [{ requesterCount: "desc" }, { createdAt: "desc" }],
            skip,
            take: limit,
        }),
        mainDb.featureProposal.count({ where }),
    ]);

    return { items, total, page, limit };
}

export async function approveFeatureProposal(id: string, decidedBy?: string) {
    const session = await requireSuperAdmin();
    const mainDb = getMainPrisma();
    return mainDb.featureProposal.update({
        where: { id },
        data: {
            status: "APPROVED",
            decidedBy: decidedBy || (session.user as { id?: string }).id || "super-admin",
            decidedAt: new Date(),
        },
    });
}

export async function rejectFeatureProposal(id: string, decisionNote?: string) {
    const session = await requireSuperAdmin();
    const mainDb = getMainPrisma();
    return mainDb.featureProposal.update({
        where: { id },
        data: {
            status: "REJECTED",
            decidedBy: (session.user as { id?: string }).id || "super-admin",
            decisionNote: (decisionNote || "").slice(0, 2000),
            decidedAt: new Date(),
        },
    });
}
