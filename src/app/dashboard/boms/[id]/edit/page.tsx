import { getBom, getProductVariants } from '@/actions/boms';
import { canViewPrices } from '@/actions/permissions';
import { BOMForm } from '@/components/production/bom/BOMForm';
import { notFound, redirect } from 'next/navigation';

interface EditBomPageProps {
    params: Promise<{
        id: string;
    }>;
}

export default async function EditBomPage({ params }: EditBomPageProps) {
    const { id } = await params;

    const [bomRes, variantsRes, showPrices] = await Promise.all([
        getBom(id),
        getProductVariants(),
        canViewPrices()
    ]);

    if (!bomRes.success || !bomRes.data) {
        notFound();
    }

    if (!variantsRes.success) {
        redirect('/dashboard/boms');
    }

    const bom = bomRes.data;
    const productVariants = variantsRes.data || [];

    return (
        <div className="relative min-h-screen">
            {/* Background Decorative Elements */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none" />

            <BOMForm
                bom={bom}
                productVariants={productVariants}
                showPrices={showPrices}
            />
        </div>
    );
}
