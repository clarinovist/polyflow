import { getSalesOrderById } from '@/actions/sales';
import { notFound } from 'next/navigation';
import { SalesOrderDetailClient } from '@/components/sales/SalesOrderDetailClient';

interface PageProps {
    params: Promise<{
        id: string;
    }>;
}



export default async function SalesOrderDetailPage({ params }: PageProps) {
    const { id } = await params;
    const order = await getSalesOrderById(id);

    if (!order) {
        notFound();
    }

    return (
        <div className="p-6 max-w-5xl mx-auto">
            <SalesOrderDetailClient order={order} />
        </div>
    );
}

