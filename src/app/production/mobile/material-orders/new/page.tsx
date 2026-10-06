import { getMaterialOrderFormData } from '@/actions/production/material-orders';
import { MobileSectionHeader } from '@/components/mobile';
import { MobileReadError } from '@/components/mobile/MobileReadError';
import { MaterialOrderForm } from './form-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Buat Material Order | PolyFlow' };

export default async function NewMaterialOrderPage() {
  const res = await getMaterialOrderFormData();
  if (!res.success) return <MobileReadError title="Form Material Order belum tersedia" />;
  return (
    <div className="space-y-4">
      <MobileSectionHeader title="Buat Material Order" level={1} />
      <p className="text-sm text-muted-foreground">Pilih formula untuk isi otomatis seperti kertas HD, atau tambah bahan manual. Submit langsung masuk antrean Kepala Pabrik.</p>
      <MaterialOrderForm data={res.data} />
    </div>
  );
}
