import { getOpnameSession } from '@/actions/opname';
import { auth } from '@/auth';
import { notFound } from 'next/navigation';
import { OpnameDetailClient, OpnameSession } from '@/components/warehouse/inventory/opname/OpnameDetailClient';
import { serializeData } from '@/lib/utils';

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function WarehouseOpnameDetailPage({ params }: PageProps) {
    const { id } = await params;
    const session = await getOpnameSession(id);

    if (!session) {
        notFound();
    }

    const serializedSession = serializeData(session) as unknown as OpnameSession;

    const userSession = await auth();
    const currentUserId = userSession?.user?.id || '';

    return <OpnameDetailClient session={serializedSession} currentUserId={currentUserId} basePath="/warehouse/opname" />;
}
