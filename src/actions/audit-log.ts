'use server';

import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

interface GetAuditLogsParams {
    page?: number;
    limit?: number;
    userId?: string;
    entityType?: string;
    action?: string;
    dateFrom?: Date;
    dateTo?: Date;
}

export async function getAuditLogs({
    page = 1,
    limit = 50,
    userId,
    entityType,
    action,
    dateFrom,
    dateTo
}: GetAuditLogsParams) {
    const session = await auth();
    if (!session || session.user.role !== 'ADMIN') {
        throw new Error('Unauthorized. Only ADMIN can view audit logs.');
    }

    const where: any = {};
    if (userId) where.userId = userId;
    if (entityType) where.entityType = entityType;
    if (action) where.action = action;
    
    if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom) where.createdAt.gte = dateFrom;
        if (dateTo) where.createdAt.lte = dateTo;
    }

    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
            where,
            include: {
                user: {
                    select: { name: true, email: true }
                }
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
        }),
        prisma.auditLog.count({ where })
    ]);

    return {
        logs,
        pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        }
    };
}

export async function getAuditLogDetail(id: string) {
    const session = await auth();
    if (!session || session.user.role !== 'ADMIN') {
        throw new Error('Unauthorized');
    }

    const log = await prisma.auditLog.findUnique({
        where: { id },
        include: {
            user: {
                select: { name: true, email: true }
            }
        }
    });

    if (!log) return null;

    // Changes are already parsed as a Prisma Json field or null, no need to JSON.parse
    return log;
}

export async function getAuditLogStats() {
    const session = await auth();
    if (!session || session.user.role !== 'ADMIN') {
        throw new Error('Unauthorized');
    }

    const [actionStats, entityStats] = await Promise.all([
        prisma.auditLog.groupBy({
            by: ['action'],
            _count: { action: true }
        }),
        prisma.auditLog.groupBy({
            by: ['entityType'],
            _count: { entityType: true }
        })
    ]);

    return {
        actions: actionStats.map(s => ({ action: s.action, count: s._count.action })),
        entities: entityStats.map(s => ({ entityType: s.entityType, count: s._count.entityType }))
    };
}
