import { prisma } from '@/lib/prisma';
import { RequestList } from './RequestList';
import { Metadata } from 'next';
import { serializeData } from '@/lib/utils';

export const metadata: Metadata = {
    title: "Purchase Requests",
    description: "Manage internal purchase requests."
};

export default async function PurchaseRequestsPage() {
    const requests = await prisma.purchaseRequest.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
            items: {
                include: {
                    productVariant: {
                        include: { product: true }
                    }
                }
            },
            salesOrder: {
                select: { orderNumber: true }
            },
            createdBy: {
                select: { name: true }
            }
        }
    });

    const suppliers = await prisma.supplier.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' }
    });

    const serializedRequests = serializeData(requests);

    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Purchase Requests</h2>
            </div>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <RequestList requests={serializedRequests as any} suppliers={suppliers} />
        </div>
    );
}
