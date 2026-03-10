import { getSalesReturnById } from '@/actions/sales-returns';
import { notFound } from 'next/navigation';
import { SalesReturnDetailClient } from '@/components/sales/SalesReturnDetailClient';
import { serializeData } from '@/lib/utils';
import { auth } from '@/auth';

interface PageProps {
    params: Promise<{
        id: string;
    }>;
}

export default async function SalesReturnDetailPage({ params }: PageProps) {
    const { id } = await params;
    const session = await auth();
    const currentUserRole = session?.user?.role;
    const salesReturn = await getSalesReturnById(id);

    if (!salesReturn) {
        notFound();
    }

    const serializedReturn = serializeData(salesReturn);

    return (
        <div className="p-6 max-w-5xl mx-auto">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <SalesReturnDetailClient salesReturn={serializedReturn as any} currentUserRole={currentUserRole} basePath="/sales/returns" />
        </div>
    );
}
