import { getSalesOrderById } from '@/actions/sales';
import { notFound } from 'next/navigation';
import { SalesOrderDetailClient } from '@/components/sales/SalesOrderDetailClient';
import { serializeData } from '@/lib/utils';

interface PageProps {
    params: Promise<{
        id: string;
    }>;
}

import { auth } from '@/auth';

export default async function SalesOrderDetailPage({ params }: PageProps) {
    const { id } = await params;
    const session = await auth();
    const currentUserRole = session?.user?.role;
    const order = await getSalesOrderById(id);

    if (!order) {
        notFound();
    }

    // Serialize all Prisma objects for Client Components
    const serializedOrder = serializeData(order);

    return (
        <div className="p-6 max-w-5xl mx-auto">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <SalesOrderDetailClient order={serializedOrder as any} currentUserRole={currentUserRole} basePath="/sales/orders" />
        </div>
    );
}
