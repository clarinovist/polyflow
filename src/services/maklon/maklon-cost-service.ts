import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/core/prisma';

export class MaklonCostService {
    static async addCostItem(data: {
        productionOrderId: string;
        costType: 'LABOR' | 'MACHINE' | 'ELECTRICITY' | 'ADDITIVE' | 'COLORANT' | 'OVERHEAD' | 'OTHER';
        amount: number;
        description?: string;
    }, tx?: Prisma.TransactionClient) {
        const client = tx || prisma;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return await (client as any).maklonCostItem.create({
            data: {
                productionOrderId: data.productionOrderId,
                costType: data.costType,
                amount: data.amount,
                description: data.description
            }
        });
    }

    static async removeCostItem(id: string, tx?: Prisma.TransactionClient) {
        const client = tx || prisma;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return await (client as any).maklonCostItem.delete({
            where: { id }
        });
    }

    static async getCostItems(productionOrderId: string, tx?: Prisma.TransactionClient) {
        const client = tx || prisma;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return await (client as any).maklonCostItem.findMany({
            where: { productionOrderId }
        });
    }

    static async updateEstimatedConversionCost(productionOrderId: string, tx?: Prisma.TransactionClient) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const execute = async (t: any) => {
            const items = await this.getCostItems(productionOrderId, t);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const total = items.reduce((sum: number, item: any) => sum + Number(item.amount), 0);

            return await t.productionOrder.update({
                where: { id: productionOrderId },
                data: { estimatedConversionCost: total }
            });
        };

        if (tx) return execute(tx);
        return await prisma.$transaction(execute);
    }
}
