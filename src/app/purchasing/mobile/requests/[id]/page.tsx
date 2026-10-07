import { notFound } from 'next/navigation';
import { getPurchasingMobileRequestDetail } from '@/actions/purchasing/mobile-dashboard';
import { MobileReadError } from '@/components/mobile';
import { PurchasingMobileDetailView } from '../../purchasing-mobile-view';

export default async function PurchasingMobileRequestDetailPage({
    params,
}: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const response = await getPurchasingMobileRequestDetail(id);
    if (!response.success) {
        if (response.code === 'NOT_FOUND') notFound();
        return <MobileReadError title="Detail purchase request belum tersedia" />;
    }
    return <PurchasingMobileDetailView detail={response.data} />;
}
