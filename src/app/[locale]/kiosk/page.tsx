import { prisma } from "@/lib/prisma";
import { serializeData } from "@/lib/utils";
import { ProductionStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { RefreshCcw, Search } from "lucide-react";
import { revalidatePath } from "next/cache";
import KioskRefreshWrapper, { Order } from "./KioskRefreshWrapper";

export default async function KioskPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
    const params = await searchParams;

    // Fetch active/released orders
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
            }
        },
        orderBy: [
            { status: 'desc' }, // IN_PROGRESS first
            { plannedStartDate: 'asc' }
        ]
    });

    const searchQuery = params?.q?.toLowerCase() || '';

    // Filter by query (if any)
    const filteredOrders = searchQuery
        ? orders.filter((o) =>
            o.orderNumber.toLowerCase().includes(searchQuery) ||
            o.bom.productVariant.name.toLowerCase().includes(searchQuery)
        )
        : orders;

    // Fetch movements for logs (Detail list)
    const orderNumbers = filteredOrders.map(o => o.orderNumber);
    const logs = await prisma.stockMovement.findMany({
        where: {
            reference: {
                in: orderNumbers.map(n => `Production Partial Output: PO-${n}`)
            }
        },
        orderBy: { createdAt: 'desc' }
    });

    // Map logs to orders
    const ordersWithLogs = filteredOrders.map(order => ({
        ...order,
        outputLogs: logs
            .filter(l => l.reference === `Production Partial Output: PO-${order.orderNumber}`)
            .map(l => ({
                id: l.id,
                quantity: l.quantity.toNumber(),
                createdAt: l.createdAt
            }))
    }));

    const serializedOrders = serializeData(ordersWithLogs) as unknown as Order[];

    // Fetch employees for operator selection
    const employees = await prisma.employee.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { name: 'asc' }
    });

    // Fetch machines for filtering
    const machines = await prisma.machine.findMany({
        orderBy: { name: 'asc' }
    });

    async function refreshData() {
        'use server';
        revalidatePath('/kiosk');
    }

    return (
        <div className="h-full flex flex-col space-y-4 md:space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-card p-4 md:p-6 rounded-xl border-2 shadow-sm gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-black tracking-tighter uppercase">JOB LIST</h1>
                    <p className="text-xs md:text-base text-muted-foreground font-medium">Select a job to start or manage production.</p>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto">
                    {searchQuery && (
                        <div className="hidden sm:flex items-center gap-2 bg-primary/10 px-4 py-2 rounded-full text-xs md:text-sm font-bold border-2 border-primary/20 text-primary whitespace-nowrap">
                            <Search className="h-4 w-4" />
                            FILTER: {searchQuery}
                        </div>
                    )}
                    <form action={refreshData} className="w-full md:w-auto">
                        <Button variant="secondary" size="lg" className="w-full md:w-auto h-12 md:h-14 md:px-8 text-base md:text-lg font-bold border-2 active:scale-95">
                            <RefreshCcw className="mr-2 h-5 w-5 md:h-6 md:w-6" />
                            REFRESH
                        </Button>
                    </form>
                </div>
            </div>

            <KioskRefreshWrapper
                initialOrders={serializedOrders}
                employees={employees.map(e => ({ id: e.id, name: e.name }))}
                machines={machines.map(m => ({ id: m.id, name: m.name }))}
            />
        </div>
    );
}
