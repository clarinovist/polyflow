import { listProcessPieceRates } from '@/actions/hrd/piece-rates';
import { PieceRateTable } from '@/components/hrd/PieceRateTable';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function PieceRatesPage() {
  const res = await listProcessPieceRates();
  const rows = res.success && res.data ? res.data : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Tarif Borongan</h1>
        <p className="text-muted-foreground mt-1">
          Rate /kg per tipe mesin. Dipakai untuk operator dengan skema gaji Borongan.
        </p>
      </div>

      <Card className="bg-background/40 backdrop-blur-xl border-white/10 shadow-xl border-0">
        <CardHeader>
          <CardTitle className="text-base">Master Process Piece Rate</CardTitle>
        </CardHeader>
        <CardContent>
          <PieceRateTable initialRows={rows} />
          <p className="text-xs text-muted-foreground mt-4">
            Rate 0 = INACTIVE. Output tanpa rate aktif tetap tercatat produksi, tapi tidak dibayar (exception di payroll).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
