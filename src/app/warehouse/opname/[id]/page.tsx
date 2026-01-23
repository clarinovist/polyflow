import { getOpnameSession } from '@/actions/opname';
import { auth } from '@/auth';
import { notFound } from 'next/navigation';
import { OpnameDetailClient } from '@/components/inventory/opname/OpnameDetailClient';

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function WarehouseOpnameDetailPage({ params }: PageProps) {
    const { id } = await params;
    const session = await getOpnameSession(id);

    if (!session) {
        notFound();
    }

    const serializedSession = {
        ...session,
        items: session.items.map((item) => ({
            ...item,
            systemQuantity: item.systemQuantity.toNumber(),
            countedQuantity: item.countedQuantity ? item.countedQuantity.toNumber() : null,
            productVariant: {
                ...item.productVariant,
                price: item.productVariant.price?.toNumber() || 0,
                buyPrice: item.productVariant.buyPrice?.toNumber() || 0,
                sellPrice: item.productVariant.sellPrice?.toNumber() || 0,
                conversionFactor: item.productVariant.conversionFactor.toNumber(),
                minStockAlert: item.productVariant.minStockAlert?.toNumber() || 0,
                reorderPoint: item.productVariant.reorderPoint?.toNumber() || 0,
                reorderQuantity: item.productVariant.reorderQuantity?.toNumber() || 0,
            }
        })),
    };

    const userSession = await auth();
    const currentUserId = userSession?.user?.id || '';

    return <OpnameDetailClient session={serializedSession} currentUserId={currentUserId} basePath="/warehouse/opname" />;
}
