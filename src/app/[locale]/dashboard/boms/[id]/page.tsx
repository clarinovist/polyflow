import { getBom } from '@/actions/boms';
import { canViewPrices } from '@/actions/permissions';
import { BOMDetails } from '@/components/production/bom/BOMDetails';
import { notFound } from 'next/navigation';

interface BomDetailPageProps {
    params: Promise<{
        id: string;
        locale: string;
    }>;
}

export default async function BomDetailPage({ params }: BomDetailPageProps) {
    const { id } = await params;

    const [bomRes, showPrices] = await Promise.all([
        getBom(id),
        canViewPrices()
    ]);

    if (!bomRes.success || !bomRes.data) {
        notFound();
    }

    const bom = bomRes.data;

    return (
        <div className="relative min-h-screen">
            {/* Background Decorative Elements */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none" />

            <BOMDetails
                bom={bom}
                showPrices={showPrices}
            />
        </div>
    );
}
