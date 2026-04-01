import { getOpnameSession } from '@/actions/inventory/opname';
import { auth } from '@/auth';
import { notFound } from 'next/navigation';
import { OpnameDetailClient, OpnameSession } from '@/components/warehouse/inventory/opname/OpnameDetailClient';
import { serializeData } from '@/lib/utils/utils';

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function WarehouseOpnameDetailPage({ params }: PageProps) {
    const { id } = await params;
    const result = await getOpnameSession(id);

    if (!result.success || !result.data) {
        notFound();
    }

    const serializedSession = serializeData(result.data) as unknown as OpnameSession;

    const userSession = await auth();
    const currentUserId = userSession?.user?.id || '';

    return <OpnameDetailClient session={serializedSession} currentUserId={currentUserId} basePath="/warehouse/opname" />;
}
