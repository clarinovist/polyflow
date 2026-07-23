import { prisma } from "@/lib/core/prisma";
import { withTenantPage } from "@/lib/core/tenant";
import { serializeData } from "@/lib/utils/utils";
import { notFound } from "next/navigation";
import KioskJobFocus, { type Order } from "./KioskJobFocus";

const getOrder = withTenantPage(async function getOrder(orderId: string) {
    const order = await prisma.productionOrder.findUnique({
        where: { id: orderId },
        include: {
            bom: {
                include: {
                    productVariant: true
                }
            },
            machine: true,
            executions: {
                orderBy: { startTime: 'desc' },
                take: 5
            },
            helpers: {
                select: {
                    id: true,
                    name: true
                }
            }
        }
    });

    if (!order) return null;

    const orderNumbers = [order.orderNumber];
    const movements = await prisma.stockMovement.findMany({
        where: {
            reference: {
                in: orderNumbers.map(n => `Production Partial Output: WO#${n}`)
            }
        },
        orderBy: { createdAt: 'desc' }
    });

    return { order, movements };
});

export default async function KioskFocusPage({ params }: { params: Promise<{ orderId: string }> }) {
    const { orderId } = await params;
    const data = await getOrder(orderId);

    if (!data) notFound();

    const { order, movements } = data;

    const orderWithLogs = {
        ...order,
        outputLogs: movements
            .filter(l => l.reference === `Production Partial Output: WO#${order.orderNumber}`)
            .map(l => ({
                id: l.id,
                quantity: l.quantity.toNumber(),
                createdAt: l.createdAt
            }))
    };

    return (
        <div className="h-full p-4 md:p-6 max-w-3xl mx-auto">
            <KioskJobFocus order={serializeData(orderWithLogs) as unknown as Order} />
        </div>
    );
}
