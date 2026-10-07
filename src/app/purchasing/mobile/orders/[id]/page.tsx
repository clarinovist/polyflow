import { notFound } from 'next/navigation';
import { getPurchasingMobileOrderDetail } from '@/actions/purchasing/mobile-dashboard';
import { MobileReadError } from '@/components/mobile';
import { PurchasingMobileDetailView } from '../../purchasing-mobile-view';

export default async function PurchasingMobileOrderDetailPage({
    params,
}: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const response = await getPurchasingMobileOrderDetail(id);
    if (!response.success) {
        if (response.code === 'NOT_FOUND') notFound();
        return <MobileReadError title="Detail purchase order belum tersedia" />;
    }
    return <PurchasingMobileDetailView detail={response.data} />;
}
