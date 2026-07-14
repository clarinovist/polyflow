import { BusinessRuleError } from '@/lib/errors/errors';
import { logger } from '@/lib/config/logger';

type DependentModel = {
    count: (args: { where: Record<string, unknown> }) => Promise<number>;
};

type AssertNoDependentsOptions = {
    /** The Prisma model to check (e.g., prisma.customer) */
    model: DependentModel;
    /** ID of the entity to check */
    id: string;
    /** Human-readable entity name (e.g., "Pelanggan") */
    entityName: string;
    /** Field name on the dependent model that references this entity (e.g., "customerId") */
    blockers: Array<{
        /** Prisma model that has the foreign key */
        model: DependentModel;
        /** Field name on the dependent model */
        fieldName: string;
        /** Human-readable name of the dependent entity (e.g., "Sales Order") */
        label: string;
    }>;
};

/**
 * Generic helper to assert that an entity has no dependents before deletion.
 *
 * Usage:
 * ```ts
 * await assertNoDependents({
 *     model: prisma.customer,
 *     id: customerId,
 *     entityName: 'Pelanggan',
 *     blockers: [
 *         { model: prisma.salesOrder, fieldName: 'customerId', label: 'Sales Order' },
 *         { model: prisma.quotation, fieldName: 'customerId', label: 'Quotation' },
 *     ],
 * });
 * ```
 *
 * Throws BusinessRuleError with details if dependents exist.
 * Does NOT log — business reject is a UI message, not an error.
 */
export async function assertNoDependents(options: AssertNoDependentsOptions): Promise<void> {
    const { id, entityName, blockers } = options;

    for (const blocker of blockers) {
        const count = await blocker.model.count({
            where: { [blocker.fieldName]: id },
        });

        if (count > 0) {
            throw new BusinessRuleError(
                `${entityName} tidak bisa dihapus karena sudah dipakai di ${count} ${blocker.label}.`,
                { entityId: id, dependentModel: blocker.label, count },
                'ENTITY_IN_USE',
            );
        }
    }
}

/**
 * Pattern for safe entity deletion with logging contract:
 * - Business reject (in use) → BusinessRuleError, NO logger.error
 * - Race condition (FK after pre-check) → logger.warn + BusinessRuleError
 * - Unexpected errors → logger.error + rethrow
 */
export async function safeDeleteEntity(
    options: AssertNoDependentsOptions & {
        deleteFn: () => Promise<unknown>;
        auditFn?: () => Promise<void>;
    },
): Promise<void> {
    const { deleteFn, auditFn, entityName, id } = options;

    // Pre-check
    await assertNoDependents(options);

    try {
        await deleteFn();
        if (auditFn) await auditFn();
    } catch (error) {
        // Race condition: dependent was created between pre-check and delete
        if (
            error instanceof Error &&
            (error.message.toLowerCase().includes('foreign key constraint') ||
             (error as unknown as Record<string, unknown>).code === 'P2003')
        ) {
            logger.warn('Entity delete race condition (FK after pre-check)', {
                entityName,
                entityId: id,
                module: 'EntityLifecycle',
            });
            throw new BusinessRuleError(
                `${entityName} baru saja digunakan di data lain. Refresh dan coba lagi.`,
                { entityId: id },
                'ENTITY_IN_USE',
            );
        }
        throw error;
    }
}
