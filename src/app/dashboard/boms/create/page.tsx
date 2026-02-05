import { getProductVariants } from '@/actions/boms';
import { canViewPrices } from '@/actions/permissions';
import { BOMForm } from '@/components/production/bom/BOMForm';
import { redirect } from 'next/navigation';

export default async function CreateBomPage() {
    const [variantsRes, showPrices] = await Promise.all([
        getProductVariants(),
        canViewPrices()
    ]);

    if (!variantsRes.success) {
        redirect('/dashboard/boms');
    }

    const productVariants = variantsRes.data || [];

    return (
        <div className="relative min-h-screen">
            {/* Background Decorative Elements */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-blue-500/5 rounded-full blur-[100px] pointer-events-none" />

            <BOMForm
                productVariants={productVariants}
                showPrices={showPrices}
            />
        </div>
    );
}
