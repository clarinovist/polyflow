import { prisma } from '@/lib/prisma';

export async function getPurchaseStats() {
    const stats = await prisma.purchaseOrder.groupBy({
        by: ['status'],
        _count: { status: true },
        _sum: { totalAmount: true }
    });

    const totalOrders = stats.reduce((acc, curr) => acc + curr._count.status, 0);
    const openOrders = stats
        .filter(s => ['SENT', 'PARTIAL_RECEIVED'].includes(s.status))
        .reduce((acc, curr) => acc + curr._count.status, 0);

    const completedOrders = stats
        .filter(s => s.status === 'RECEIVED')
        .reduce((acc, curr) => acc + curr._count.status, 0);

    const totalSpend = stats.reduce((acc, curr) => acc + (curr._sum.totalAmount?.toNumber() || 0), 0);

    return {
        totalOrders,
        openOrders,
        completedOrders,
        totalSpend
    };
}
