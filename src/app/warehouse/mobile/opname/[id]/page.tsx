import { getOpnameSession } from '@/actions/inventory/opname';
import { listWarehouseAttachments } from '@/actions/warehouse/operational-attachments';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { serializeData } from '@/lib/utils/utils';
import { MobileOpnameDetailClient } from './MobileOpnameDetailClient';

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function MobileOpnameDetailPage({ params }: PageProps) {
    const { id } = await params;
    const [result, attachmentsRes] = await Promise.all([
        getOpnameSession(id),
        listWarehouseAttachments({ stockOpnameId: id }),
    ]);

    if (!result.success || !result.data) {
        redirect('/warehouse/mobile/opname?error=not-found');
    }

    const userSession = await auth();
    const currentUserId = userSession?.user?.id || '';

    const attachments =
        attachmentsRes.success && attachmentsRes.data
            ? (serializeData(attachmentsRes.data) as unknown as Array<{
                  id: string;
                  checkpoint: string;
                  documentType: string;
                  url: string;
                  originalName?: string | null;
                  mimeType?: string | null;
                  sizeBytes?: number | null;
                  note?: string | null;
                  createdAt: string;
                  uploadedBy?: { id: string; name: string | null } | null;
              }>)
            : [];

    return (
        <MobileOpnameDetailClient
            session={serializeData(result.data) as never}
            currentUserId={currentUserId}
            attachments={attachments}
        />
    );
}
