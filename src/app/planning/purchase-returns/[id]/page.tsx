import { getPurchaseReturnById } from '@/actions/purchasing/purchase-returns';
import { notFound } from 'next/navigation';
import { PurchaseReturnDetailClient } from '@/components/purchasing/PurchaseReturnDetailClient';
import { serializeData } from '@/lib/utils/utils';
import { auth } from '@/auth';

interface PageProps {
    params: Promise<{
        id: string;
    }>;
}

export default async function PurchaseReturnDetailPage({ params }: PageProps) {
    const { id } = await params;
    const session = await auth();
    const currentUserRole = session?.user?.role;
    const purchaseReturn = await getPurchaseReturnById(id);

    if (!purchaseReturn) {
        notFound();
    }

    const serializedReturn = serializeData(purchaseReturn);

    return (
        <div className="p-6 max-w-5xl mx-auto">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <PurchaseReturnDetailClient purchaseReturn={serializedReturn as any} currentUserRole={currentUserRole} basePath="/planning/purchase-returns" />
        </div>
    );
}
