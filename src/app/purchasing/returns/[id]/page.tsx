import type { ComponentProps } from 'react';
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
    const purchaseReturnRes = await getPurchaseReturnById(id);

    if (!purchaseReturnRes.success || !purchaseReturnRes.data) {
        notFound();
    }

    const serializedReturn = serializeData(purchaseReturnRes.data);

    return (
        <div className="p-6 max-w-5xl mx-auto">
            <PurchaseReturnDetailClient
                purchaseReturn={
                    serializedReturn as unknown as ComponentProps<
                        typeof PurchaseReturnDetailClient
                    >['purchaseReturn']
                }
                currentUserRole={currentUserRole}
                basePath="/purchasing/returns"
            />
        </div>
    );
}
