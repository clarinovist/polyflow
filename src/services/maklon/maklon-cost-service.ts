import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/core/prisma';

type MaklonCostClient = Prisma.TransactionClient | typeof prisma;

export class MaklonCostService {
    static async addCostItem(data: {
        productionOrderId: string;
        costType: 'LABOR' | 'MACHINE' | 'ELECTRICITY' | 'ADDITIVE' | 'COLORANT' | 'OVERHEAD' | 'OTHER';
        amount: number;
        description?: string;
    }, tx?: Prisma.TransactionClient) {
        const client: MaklonCostClient = tx || prisma;

        return await client.maklonCostItem.create({
            data: {
                productionOrderId: data.productionOrderId,
                costType: data.costType,
                amount: data.amount,
                description: data.description
            }
        });
    }

    static async removeCostItem(id: string, tx?: Prisma.TransactionClient) {
        const client: MaklonCostClient = tx || prisma;
        return await client.maklonCostItem.delete({
            where: { id }
        });
    }

    static async getCostItems(productionOrderId: string, tx?: Prisma.TransactionClient) {
        const client: MaklonCostClient = tx || prisma;
        return await client.maklonCostItem.findMany({
            where: { productionOrderId }
        });
    }

    static async updateEstimatedConversionCost(productionOrderId: string, tx?: Prisma.TransactionClient) {
        const execute = async (t: Prisma.TransactionClient) => {
            const items = await this.getCostItems(productionOrderId, t);
            const total = items.reduce((sum, item) => sum + Number(item.amount), 0);

            return await t.productionOrder.update({
                where: { id: productionOrderId },
                data: { estimatedConversionCost: total }
            });
        };

        if (tx) return execute(tx);
        return await prisma.$transaction(execute);
    }
}
