import { prisma } from '@/lib/core/prisma';
import {
    QualityCheckParameterValues,
    UpdateQualityCheckParameterValues,
} from '@/lib/schemas/production';
import { NotFoundError } from '@/lib/errors/errors';

export class QualityStandardService {
    static async listByVariant(productVariantId: string) {
        return prisma.qualityCheckParameter.findMany({
            where: { productVariantId },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        });
    }

    static async create(data: QualityCheckParameterValues) {
        return prisma.qualityCheckParameter.create({ data });
    }

    static async update(data: UpdateQualityCheckParameterValues) {
        const { id, ...rest } = data;
        const existing = await prisma.qualityCheckParameter.findUnique({
            where: { id },
            select: { id: true },
        });
        if (!existing) {
            throw new NotFoundError('Parameter QC tidak ditemukan');
        }
        return prisma.qualityCheckParameter.update({
            where: { id },
            data: rest,
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
