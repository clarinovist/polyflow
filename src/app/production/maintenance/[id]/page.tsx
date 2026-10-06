import { getMaintenanceDetail } from '@/actions/production/maintenance';
import { MobileReadError } from '@/components/mobile/MobileReadError';
import { MaintenanceActions } from './actions';

export const dynamic = 'force-dynamic';

export default async function MaintenanceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await getMaintenanceDetail(id);
  if (!res.success) return <MobileReadError title="Detail maintenance belum tersedia" />;
  const o = res.data;
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-xl font-bold">{o.orderNumber} · {o.machine.code}</h1>
      <p className="text-sm text-muted-foreground">Status: {o.status} · Urgensi: {o.urgency}{o.assigneeName ? ' · Teknisi: ' + o.assigneeName : ''}</p>
      <p className="text-sm">{o.complaint}</p>
      {o.spareParts.length > 0 && (
        <table className="w-full text-sm">
          <thead><tr className="text-left"><th>Spare part</th><th>Spesifikasi</th><th>Qty</th><th>Terpasang</th></tr></thead>
          <tbody>
            {o.spareParts.map((s: { id: string; name: string; spec: string | null; quantity: unknown; fulfilled: boolean }) => (
              <tr key={s.id} className="border-t"><td>{s.name}</td><td>{s.spec || '-'}</td><td>{String(s.quantity)}</td><td>{s.fulfilled ? 'Ya' : '-'}</td></tr>
            ))}
          </tbody>
        </table>
      )}
      {o.completionNote && <p className="rounded-xl border p-3 text-sm">Hasil: {o.completionNote}</p>}
      <MaintenanceActions id={o.id} status={o.status} spareParts={o.spareParts} />
    </div>
  );
}
