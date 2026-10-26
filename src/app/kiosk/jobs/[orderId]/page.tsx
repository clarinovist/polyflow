import { prisma } from '@/lib/core/prisma';
import { withTenantPage } from '@/lib/core/tenant';
import { serializeData } from '@/lib/utils/utils';
import { notFound } from 'next/navigation';
import KioskJobFocus, { type Order, type Shift } from './KioskJobFocus';
import { ISSUABLE_MATERIAL_TYPES } from '@/lib/constants/products';

const getOrder = withTenantPage(async function getOrder(orderId: string) {
    const order = await prisma.productionOrder.findUnique({
        where: { id: orderId },
        include: {
            bom: {
                include: {
                    productVariant: true,
                    items: {
                        include: {
                            productVariant: {
                                select: {
                                    id: true,
                                    name: true,
                                    skuCode: true,
                                    primaryUnit: true,
                                },
                            },
                        },
                    },
                },
            },
            machine: true,
            executions: {
                orderBy: { startTime: 'desc' },
                include: {
                    operator: { select: { name: true } },
                    shift: { select: { shiftName: true } },
                },
            },
            helpers: {
                select: {
                    id: true,
                    name: true,
                },
            },
        },
    });

    if (!order || !['RELEASED', 'IN_PROGRESS'].includes(order.status)) {
        return null;
    }

    const [shifts, materials] = await Promise.all([
        prisma.productionShift.findMany({
            where: { productionOrderId: orderId },
            select: {
                id: true,
                shiftName: true,
                startTime: true,
                endTime: true,
                operatorId: true,
            },
            orderBy: { startTime: 'asc' },
        }),
        prisma.productVariant.findMany({
            where: {
                archivedAt: null,
                product: {
                    productType: { in: [...ISSUABLE_MATERIAL_TYPES] },
                },
            },
            select: {
                id: true,
                name: true,
                skuCode: true,
                primaryUnit: true,
                product: { select: { productType: true } },
            },
            orderBy: { name: 'asc' },
        }),
    ]);

    return { order, shifts, materials };
});

type ExecutionLogSource = {
    id: string;
    status: string;
    endTime: Date | null;
    quantityProduced: unknown;
    createdAt: Date;
};

// Read logs from executions. The stock-movement reference the kiosk used to
// match ("Production Partial Output") has not been written since 2026-06-25.
function toOutputLogs(executions: ExecutionLogSource[]) {
    return executions
        .filter(
            (execution) =>
                execution.status !== 'VOIDED' &&
                execution.endTime !== null &&
                Number(execution.quantityProduced) > 0,
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((execution) => ({
            id: execution.id,
            quantity: Number(execution.quantityProduced),
            createdAt: execution.createdAt,
        }));
}

export default async function KioskFocusPage({
    params,
}: {
    params: Promise<{ orderId: string }>;
}) {
    const { orderId } = await params;
    const data = await getOrder(orderId);

    if (!data) notFound();

    const { order, shifts, materials } = data;

    const orderWithLogs = {
        ...order,
        outputLogs: toOutputLogs(order.executions),
    };

    return (
        <div className="h-full p-4 md:p-6 max-w-3xl mx-auto">
            <KioskJobFocus
                order={serializeData(orderWithLogs) as unknown as Order}
                shifts={serializeData(shifts) as unknown as Shift[]}
                materials={serializeData(materials)}
            />
        </div>
    );
}
