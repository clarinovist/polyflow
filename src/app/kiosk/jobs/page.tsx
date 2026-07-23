import { prisma } from "@/lib/core/prisma";
import { withTenantPage } from "@/lib/core/tenant";
import { serializeData } from "@/lib/utils/utils";
import { ProductionStatus } from "@prisma/client";
import KioskJobList, { type Order } from "./KioskJobList";

const getData = withTenantPage(async function getData() {
    const orders = await prisma.productionOrder.findMany({
        where: {
            status: { in: [ProductionStatus.RELEASED, ProductionStatus.IN_PROGRESS] }
        },
        include: {
            bom: {
                include: {
                    productVariant: true
                }
            },
            machine: true,
            executions: {
                where: {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    endTime: { equals: null as any }
                },
                orderBy: { startTime: 'desc' },
                take: 1
            },
            helpers: {
                select: {
                    id: true,
                    name: true
                }
            }
        },
        orderBy: [
            { status: 'desc' },
            { plannedStartDate: 'asc' }
        ]
    });

    const employees = await prisma.employee.findMany({
        where: {
            status: 'ACTIVE',
            role: 'OPERATOR'
        },
        select: {
            id: true,
            name: true,
            machineAssignments: {
                select: {
                    machineId: true,
                    isPrimary: true,
                }
            }
        }
    });

    const machines = await prisma.machine.findMany({
        select: {
            id: true,
            name: true,
            operators: {
                select: {
                    employeeId: true,
                    isPrimary: true,
                }
            }
        }
    });

    const orderNumbers = orders.map(o => o.orderNumber);
    const movements = await prisma.stockMovement.findMany({
        where: {
            reference: {
                in: orderNumbers.map(n => `Production Partial Output: WO#${n}`)
            }
        },
        orderBy: { createdAt: 'desc' }
    });

    return { orders, employees, machines, movements };
});

export const metadata = {
    title: "Daftar SPK - Kiosk",
};

export default async function KioskJobsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
    const params = await searchParams;
    const { orders, employees, machines, movements } = await getData();

    const searchQuery = params?.q?.toLowerCase() || '';

    const filteredOrders = searchQuery
        ? orders.filter((o) =>
            o.orderNumber.toLowerCase().includes(searchQuery) ||
            o.bom.productVariant.name.toLowerCase().includes(searchQuery)
        )
        : orders;

    const ordersWithLogs = filteredOrders.map(order => ({
        ...order,
        outputLogs: movements
            .filter(l => l.reference === `Production Partial Output: WO#${order.orderNumber}`)
            .map(l => ({
                id: l.id,
                quantity: l.quantity.toNumber(),
                createdAt: l.createdAt
            }))
    }));

    const serializedOrders = serializeData(ordersWithLogs);

    return (
        <div className="h-full flex flex-col space-y-4 md:space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
            <KioskJobList
                initialOrders={serializedOrders as unknown as Order[]}
                employees={employees.map(e => ({
                    id: e.id,
                    name: e.name,
                    machineIds: e.machineAssignments.map(a => a.machineId)
                }))}
                machines={machines.map(m => ({
                    id: m.id,
                    name: m.name,
                    operatorIds: m.operators.map(o => o.employeeId)
                }))}
            />
        </div>
    );
}
