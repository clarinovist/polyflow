import { getSparePartStock, getOperationalVariants } from '@/actions/inventory/sparepart-stock';
import { MobileReadError } from '@/components/mobile/MobileReadError';
import { SparePartStockInForm } from './stock-in-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Stok Spare Part | PolyFlow' };

export default async function SparePartStockPage() {
  const [stock, variants] = await Promise.all([getSparePartStock(), getOperationalVariants()]);
  if (!stock.success || !variants.success) return <MobileReadError title="Stok spare part belum tersedia" />;
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-xl font-bold">Stok Spare Part</h1>
      <p className="text-sm text-muted-foreground">Varian OPERATIONAL. Masuk tercatat + jurnal otomatis; pakai tercatat saat work order selesai.</p>
      <SparePartStockInForm locations={stock.data.locations} variants={variants.data} />
      <table className="w-full text-sm">
        <thead><tr className="text-left"><th>Part</th><th>Lokasi</th><th>Qty</th><th>Rata-rata</th></tr></thead>
        <tbody>
          {stock.data.rows.map((r: { productVariant: { id: string; name: string }; location: { id: string; name: string }; quantity: unknown; averageCost: unknown }) => (
            <tr key={r.productVariant.id + r.location.id} className="border-t">
              <td>{r.productVariant.name}</td><td>{r.location.name}</td><td>{String(r.quantity)}</td><td>{r.averageCost ? String(r.averageCost) : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!stock.data.rows.length && <p className="text-sm">Belum ada stok. Catat stok awal di atas.</p>}
    </div>
  );
}
