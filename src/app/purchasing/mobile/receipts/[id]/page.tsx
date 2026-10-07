import { notFound } from 'next/navigation';
import { getPurchasingMobileReceiptDetail } from '@/actions/purchasing/mobile-dashboard';
import { MobileReadError } from '@/components/mobile';
import { PurchasingMobileDetailView } from '../../purchasing-mobile-view';

export default async function PurchasingMobileReceiptDetailPage({
    params,
}: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const response = await getPurchasingMobileReceiptDetail(id);
    if (!response.success) {
        if (response.code === 'NOT_FOUND') notFound();
        return <MobileReadError title="Detail penerimaan belum tersedia" />;
    }
    return <PurchasingMobileDetailView detail={response.data} />;
}
