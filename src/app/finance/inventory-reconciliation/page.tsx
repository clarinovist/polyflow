import { requireFinanceAccess } from '@/lib/auth/finance-access';
import { InventoryReconciliation } from '@/components/finance/InventoryReconciliation';

export default async function InventoryReconciliationPage() {
    await requireFinanceAccess();
    return (
        <div className="mx-auto max-w-6xl space-y-4">
            <h1 className="text-2xl font-bold">Rekonsiliasi nilai ATK</h1>
            <p className="text-muted-foreground">
                Periksa biaya stok dan jurnal sumber tanpa mengubah jumlah
                fisik.
            </p>
            <InventoryReconciliation />
        </div>
    );
}
