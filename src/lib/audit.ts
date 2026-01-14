import { prisma } from '@/lib/prisma';
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
    changes?: Record<string, any>;
    tx?: PrismaTransaction;
}

export async function logActivity({
    userId,
    action,
    entityType,
    entityId,
    details,
    changes,
    tx
}: AuditLogParams) {
    const data = {
        userId,
        action,
        entityType,
        entityId,
        details,
        changes: changes ? JSON.stringify(changes) : undefined,
    };

    if (tx) {
        await tx.auditLog.create({ data });
    } else {
        await prisma.auditLog.create({ data });
    }
}
