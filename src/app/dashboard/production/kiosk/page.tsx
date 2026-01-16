import { prisma } from "@/lib/prisma"; // Re-added
import { serializeData } from "@/lib/utils";
import { ProductionStatus, MovementType } from "@prisma/client";
import { KioskOrderCard } from "@/components/production/kiosk/KioskOrderCard";
import { Button } from "@/components/ui/button";
import { RefreshCcw, Search, X } from "lucide-react";
import { revalidatePath } from "next/cache";
import KioskRefreshWrapper from "./KioskRefreshWrapper";

// Server Component fetching data
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
        ? orders.filter((o: any) =>
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

    // Serialize using generic helper to handle all Decimals deeply
    const serializedOrders = serializeData(ordersWithLogs) as any[];

    // Server Action for Manual Refresh
    async function refreshData() {
        'use server';
        revalidatePath('/dashboard/production/kiosk');
    }

    return (
        <div className="h-full flex flex-col space-y-6 p-6">
            <div className="flex justify-between items-center bg-card p-4 rounded-lg border shadow-sm">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Operator Kiosk</h1>
                    <p className="text-muted-foreground">Select a job to start or manage active production.</p>
                </div>
                <div className="flex items-center gap-4">
                    {searchQuery && (
                        <div className="flex items-center gap-2 bg-accent/50 px-3 py-1 rounded-full text-sm font-medium border border-accent">
                            <Search className="h-4 w-4" />
                            Filter: {searchQuery}
                            <form action={async () => {
                                'use server';
                                // Workaround to clear query params in server actions is tricky without redirect
                                // We'll handle clear in Client Wrapper
                            }}>
                                {/* Clear handled in client wrapper */}
                            </form>
                        </div>
                    )}
                    <form action={refreshData}>
                        <Button variant="outline" size="lg" className="h-12 px-6">
                            <RefreshCcw className="mr-2 h-5 w-5" />
                            Refresh
                        </Button>
                    </form>
                </div>
            </div>

            <KioskRefreshWrapper initialOrders={serializedOrders} />

        </div>
    );
}
