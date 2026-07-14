import { prisma } from '@/lib/core/prisma';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import { logger } from '@/lib/config/logger';

export type BomUsageInfo = {
    productionOrderCount: number;
};

export type BomLifecycleResult = {
    ok: boolean;
    reason?: string;
    count?: number;
};

type BomLifecycleContext = {
    userId: string;
};

/**
 * Service responsible for BOM lifecycle operations: hard delete, archive, reactivate.
 *
 * Invariants enforced:
 * - Hard delete only when usage count = 0
 * - Archive sets isActive = false; handle default replacement
 * - Reactivate sets isActive = true
 * - Expected business rejects do NOT use logger.error
 */
export class BomLifecycleService {
    /**
     * Get the production order count referencing this BOM.
     */
    static async getUsage(bomId: string): Promise<BomUsageInfo> {
        const count = await prisma.productionOrder.count({
            where: { bomId },
        });
        return { productionOrderCount: count };
    }

    /**
     * Pre-check: can this BOM be hard-deleted?
     */
    static async canHardDelete(bomId: string): Promise<BomLifecycleResult> {
        const bom = await prisma.bom.findUnique({ where: { id: bomId } });
        if (!bom) {
            return { ok: false, reason: 'BOM_NOT_FOUND' };
        }

        const { productionOrderCount } = await this.getUsage(bomId);
        if (productionOrderCount > 0) {
            return {
                ok: false,
                reason: 'BOM_IN_USE',
                count: productionOrderCount,
            };
        }
        return { ok: true };
    }

    /**
     * Hard delete a BOM that has never been used in any Production Order.
     * Throws BusinessRuleError if the BOM is in use or not found.
     * Uses warn for race condition (P2003 after pre-check).
     */
    static async hardDelete(bomId: string, _ctx: BomLifecycleContext): Promise<void> {
        const bom = await prisma.bom.findUnique({ where: { id: bomId } });
        if (!bom) {
            throw new NotFoundError('Resep', bomId);
        }

        const { productionOrderCount } = await this.getUsage(bomId);
        if (productionOrderCount > 0) {
            throw new BusinessRuleError(
                `Resep tidak bisa dihapus karena sudah dipakai di ${productionOrderCount} Production Order. Nonaktifkan saja agar tidak muncul di produksi baru.`,
                { bomId, productionOrderCount },
                'BOM_IN_USE',
            );
        }

        try {
            await prisma.bom.delete({ where: { id: bomId } });
        } catch (error) {
            // Race condition: PO was created between pre-check and delete
            if (
                error instanceof Error &&
                (error.message.toLowerCase().includes('foreign key constraint') ||
                 (error as unknown as Record<string, unknown>).code === 'P2003')
            ) {
                logger.warn('BOM delete race condition (FK constraint after pre-check)', {
                    bomId,
                    module: 'BomLifecycleService',
                });
                throw new BusinessRuleError(
                    'Resep baru saja digunakan di Production Order. Nonaktifkan saja agar tidak muncul di produksi baru.',
                    { bomId },
                    'BOM_IN_USE',
                );
            }
            throw error;
        }
    }

    /**
     * Archive (deactivate) a BOM. Sets isActive = false.
     * If the BOM is a default, a replacement must be provided.
     */
    static async archive(
        bomId: string,
        ctx: BomLifecycleContext,
        newDefaultBomId?: string,
    ): Promise<void> {
        const bom = await prisma.bom.findUnique({ where: { id: bomId } });
        if (!bom) {
            throw new NotFoundError('Resep', bomId);
        }

        if (!bom.isActive) {
            throw new BusinessRuleError(
                'Resep sudah dinonaktifkan sebelumnya.',
                { bomId },
                'BOM_ALREADY_ARCHIVED',
            );
        }

        // If this is the default, require a replacement
        if (bom.isDefault) {
            if (!newDefaultBomId) {
                throw new BusinessRuleError(
                    'Resep ini adalah default. Pilih resep aktif lain sebagai default sebelum menonaktifkan.',
                    { bomId },
                    'BOM_DEFAULT_REPLACEMENT_REQUIRED',
                );
            }

            // Validate replacement
            const replacement = await prisma.bom.findUnique({
                where: { id: newDefaultBomId },
            });
            if (!replacement) {
                throw new BusinessRuleError(
                    'Resep pengganti tidak ditemukan.',
                    { bomId, newDefaultBomId },
                    'BOM_REPLACEMENT_INVALID',
                );
            }
            if (replacement.productVariantId !== bom.productVariantId) {
                throw new BusinessRuleError(
                    'Resep pengganti harus dari produk yang sama.',
                    { bomId, newDefaultBomId },
                    'BOM_REPLACEMENT_INVALID',
                );
            }
            if (!replacement.isActive) {
                throw new BusinessRuleError(
                    'Resep pengganti harus dalam status aktif.',
                    { bomId, newDefaultBomId },
                    'BOM_REPLACEMENT_INVALID',
                );
            }
            if (replacement.id === bom.id) {
                throw new BusinessRuleError(
                    'Resep pengganti tidak boleh itu sendiri.',
                    { bomId, newDefaultBomId },
                    'BOM_REPLACEMENT_INVALID',
                );
            }

            // Atomic: archive source + set replacement as default
            await prisma.$transaction(async (tx) => {
                await tx.bom.update({
                    where: { id: bomId },
                    data: {
                        isActive: false,
                        isDefault: false,
                        archivedAt: new Date(),
                        archivedById: ctx.userId,
                    },
                });
                await tx.bom.update({
                    where: { id: newDefaultBomId },
                    data: { isDefault: true },
                });
            });
        } else {
            // Non-default: just archive
            await prisma.bom.update({
                where: { id: bomId },
                data: {
                    isActive: false,
                    archivedAt: new Date(),
                    archivedById: ctx.userId,
                },
            });
        }
    }

    /**
     * Reactivate an archived BOM.
     */
    static async reactivate(bomId: string, _ctx: BomLifecycleContext): Promise<void> {
        const bom = await prisma.bom.findUnique({ where: { id: bomId } });
        if (!bom) {
            throw new NotFoundError('Resep', bomId);
        }

        if (bom.isActive) {
            throw new BusinessRuleError(
                'Resep sudah aktif.',
                { bomId },
                'BOM_ALREADY_ACTIVE',
            );
        }

        await prisma.bom.update({
            where: { id: bomId },
            data: {
                isActive: true,
                archivedAt: null,
                archivedById: null,
            },
        });
    }
}
