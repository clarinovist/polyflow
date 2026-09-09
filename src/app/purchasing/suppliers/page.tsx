import { getSuppliers } from '@/actions/purchasing/supplier';
import { SupplierListClient } from '@/components/purchasing/suppliers/SupplierListClient';

export default async function SuppliersPage() {
    const result = await getSuppliers();
    if (!result.success) {
        throw new Error('Gagal memuat supplier. Silakan coba lagi.');
    }
    return <SupplierListClient suppliers={result.data} />;
}
