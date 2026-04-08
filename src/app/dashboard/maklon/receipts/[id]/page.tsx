import { notFound } from 'next/navigation';
import { getMaklonReceipt } from '@/actions/maklon/maklon-receipt';
import { MaklonReceiptDetail } from '@/components/maklon/MaklonReceiptDetail';
import type { Metadata } from 'next';

interface PageProps {
    params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
    title: 'Maklon Receipt Detail | Polyflow',
    description: 'Detail penerimaan bahan baku Maklon Jasa dari customer',
};

export default async function MaklonReceiptDetailPage({ params }: PageProps) {
    const { id } = await params;
    const receipt = await getMaklonReceipt(id);

    if (!receipt) {
        notFound();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return <MaklonReceiptDetail receipt={receipt as any} />;
}
