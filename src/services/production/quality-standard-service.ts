import { prisma } from '@/lib/core/prisma';
import {
    QualityCheckParameterValues,
    UpdateQualityCheckParameterValues,
} from '@/lib/schemas/production';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';

function validateRange(data: { minValue?: unknown; maxValue?: unknown; targetValue?: unknown }) {
    const min = data.minValue == null ? null : Number(data.minValue);
    const max = data.maxValue == null ? null : Number(data.maxValue);
    const target = data.targetValue == null ? null : Number(data.targetValue);
    if ([min, max, target].some((n) => n !== null && !Number.isFinite(n)) ||
        (min !== null && max !== null && min > max) ||
        (target !== null && ((min !== null && target < min) || (max !== null && target > max)))) {
        throw new BusinessRuleError('Rentang standar tidak valid: minimum ≤ target ≤ maksimum.');
    }
}

export class QualityStandardService {
    static async listByVariant(productVariantId: string, requiredOnly = false) {
        return prisma.qualityCheckParameter.findMany({
            where: { productVariantId, ...(requiredOnly ? { requireMeasurement: true } : {}) },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        });
    }

    static async create(data: QualityCheckParameterValues) {
        validateRange(data);
        return prisma.qualityCheckParameter.create({ data });
    }

    static async update(data: UpdateQualityCheckParameterValues) {
        const { id, ...rest } = data;
        return prisma.$transaction(async (tx) => {
            // Serialize partial range edits: simultaneous min/max changes must
            // validate against the latest committed bounds, not stale values.
            await tx.$queryRaw`SELECT "id" FROM "QualityCheckParameter" WHERE "id" = ${id} FOR UPDATE`;
            const existing = await tx.qualityCheckParameter.findUnique({
                where: { id },
                select: { id: true, minValue: true, maxValue: true, targetValue: true },
            });
            if (!existing) {
                throw new NotFoundError('Parameter QC tidak ditemukan');
            }
            validateRange({ ...existing, ...Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined)) });
            return tx.qualityCheckParameter.update({ where: { id }, data: rest });
        });
    }

    static async delete(id: string) {
        const existing = await prisma.qualityCheckParameter.findUnique({
            where: { id },
            select: { id: true },
        });
        if (!existing) {
            throw new NotFoundError('Parameter QC tidak ditemukan');
        }
        await prisma.qualityCheckParameter.delete({ where: { id } });
    }
}
