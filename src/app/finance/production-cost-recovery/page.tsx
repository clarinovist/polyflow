import { requireFinanceAccess } from '@/lib/auth/finance-access';
import { ProductionCostRecovery } from '@/components/production/order-detail/ProductionCostRecovery';

export default async function ProductionCostRecoveryPage() {
    await requireFinanceAccess();
    return (
        <div className="mx-auto max-w-3xl space-y-4">
            <h1 className="text-2xl font-bold">Pemulihan biaya SPK</h1>
            <p className="text-muted-foreground">
                Cari nomor SPK di ruang kerja aktif. Hanya koreksi terbatas
                dengan sumber dan cadangan pemulihan terverifikasi yang dapat
                diterapkan.
            </p>
            <ProductionCostRecovery />
        </div>
    );
}
