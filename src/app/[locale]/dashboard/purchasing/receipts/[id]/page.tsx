import { PurchaseService } from '@/services/purchase-service';
import { notFound } from 'next/navigation';
import { GoodsReceiptDetailClient } from '@/components/purchasing/GoodsReceiptDetailClient';
import { Metadata } from 'next';
import { serializeData } from '@/lib/utils';

interface PageProps {
    params: Promise<{
        id: string;
    }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { id } = await params;
    const receipt = await PurchaseService.getGoodsReceiptById(id);
    return {
        title: receipt ? `${receipt.receiptNumber} | PolyFlow` : 'Receipt Not Found',
    };
}

export default async function GoodsReceiptDetailPage({ params }: PageProps) {
    const { id } = await params;
    const receipt = await PurchaseService.getGoodsReceiptById(id);

    if (!receipt) {
        notFound();
    }

    // Serialize all Prisma objects for Client Components
    const serializedReceipt = serializeData(receipt);

    return (
        <div className="p-6 max-w-6xl mx-auto">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <GoodsReceiptDetailClient receipt={serializedReceipt as any} />
        </div>
    );
}
