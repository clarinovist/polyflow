import { getOpnameSession } from '@/actions/inventory/opname';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { serializeData } from '@/lib/utils/utils';
import { MobileOpnameDetailClient } from './MobileOpnameDetailClient';

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function MobileOpnameDetailPage({ params }: PageProps) {
    const { id } = await params;
    const result = await getOpnameSession(id);

    if (!result.success || !result.data) {
        redirect('/warehouse/mobile/opname?error=not-found');
    }

    const userSession = await auth();
    const currentUserId = userSession?.user?.id || '';

    return (
        <MobileOpnameDetailClient
            session={serializeData(result.data) as never}
            currentUserId={currentUserId}
        />
    );
}
