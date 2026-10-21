import { prisma } from '@/lib/core/prisma';
import { withTenantPage } from '@/lib/core/tenant';
import { requirePlanningRole } from '@/lib/tools/auth-checks';
import { PackagingSettings } from './settings';

const PackagingSettingsPage = withTenantPage(async function PackagingSettingsPage() {
    await requirePlanningRole();
    const [variants, customers, options] = await Promise.all([
        prisma.productVariant.findMany({ where: { archivedAt: null }, select: {
            id: true, name: true, skuCode: true, productId: true, primaryUnit: true,
            product: { select: { productType: true } },
        }, orderBy: { name: 'asc' } }),
        prisma.customer.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
        prisma.productionPackagingOption.findMany({ include: {
            baseVariant: { select: { name: true } }, outputVariant: { select: { name: true } }, labelVariant: { select: { name: true } },
        } }),
    ]);
    return <main className="mx-auto max-w-4xl space-y-6 p-4">
        <h1 className="text-2xl font-semibold">Kemasan produksi</h1>
        <p className="text-sm text-muted-foreground">Gunakan SKU hasil berbeda untuk setiap merek, tanpa menyalin BOM. Buat SKU melalui katalog; satuan dan produk induknya harus sama. Lokasi titipan baru selalu kosong—penerimaan mengikuti alur barang titipan yang sudah tersedia.</p>
        <PackagingSettings variants={variants} customers={customers} />
        <section className="space-y-2"><h2 className="font-semibold">Pemetaan aktif</h2>
            {options.length ? <ul className="space-y-2">{options.map((option) => <li key={option.id} className="rounded-md border p-3 text-sm">{option.baseVariant.name} → <strong>{option.outputVariant.name}</strong> · Etiket: {option.labelVariant?.name ?? 'Tidak ditetapkan'}</li>)}</ul> : <p className="text-sm">Belum ada pemetaan.</p>}
        </section>
    </main>;
});
export default PackagingSettingsPage;
