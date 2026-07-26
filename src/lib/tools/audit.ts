import { prisma } from '@/lib/core/prisma';
import { PrismaClient } from '@prisma/client';

type PrismaTransaction = Omit<
    PrismaClient,
    '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

interface AuditLogParams {
    userId: string;
    action: string;
    entityType: string;
    entityId: string;
    details?: string;
    changes?: Record<string, unknown>;
    fromStatus?: string;
    toStatus?: string;
    tx?: PrismaTransaction;
}

export async function logActivity({
    userId,
    action,
    entityType,
    entityId,
    details,
    changes,
    fromStatus,
    toStatus,
    tx,
}: AuditLogParams) {
    const data = {
        userId,
        action,
        entityType,
        entityId,
        details,
        changes: changes ? JSON.stringify(changes) : undefined,
        fromStatus,
        toStatus,
    };

    if (tx) {
        await tx.auditLog.create({ data });
    } else {
        await prisma.auditLog.create({ data });
    }
}
