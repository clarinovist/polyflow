import { Suspense } from 'react';
import { getProductionHistory, getProductionHistoryFilterOptions, type ProductionHistoryFilter, type ProductionHistorySummary } from '@/actions/production/production-execution';
import { ProductionHistoryClient } from '@/components/production/ProductionHistoryClient';
import { ProductionHistoryFilters } from '@/components/production/ProductionHistoryFilters';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, AlertTriangle, FileText, Camera } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ProductionHistoryPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const from = typeof params.from === 'string' ? params.from : undefined;
  const to = typeof params.to === 'string' ? params.to : undefined;
  const q = typeof params.q === 'string' ? params.q : undefined;
  const machineId = typeof params.machineId === 'string' ? params.machineId : undefined;
  const operatorId = typeof params.operatorId === 'string' ? params.operatorId : undefined;
  const shiftId = typeof params.shiftId === 'string' ? params.shiftId : undefined;
  const productVariantId = typeof params.productVariantId === 'string' ? params.productVariantId : undefined;
  const hasScrap = params.hasScrap === 'true';
  const missingPhoto = params.missingPhoto === 'true';
  const includeVoided = params.includeVoided === 'true';

  const filter: ProductionHistoryFilter = {
    from,
    to,
    q,
    machineId,
    operatorId,
    shiftId,
    productVariantId,
    hasScrap: hasScrap || undefined,
    missingPhoto: missingPhoto || undefined,
    includeVoided: includeVoided || undefined,
  };

  const [historyResult, filterOptionsResult] = await Promise.all([
    getProductionHistory(filter),
    getProductionHistoryFilterOptions(),
  ]);

  const defaultSummary: ProductionHistorySummary = { totalGood: 0, totalScrap: 0, executionCount: 0, orderCount: 0, missingPhotoCount: 0, limit: 200, isTruncated: false };
  const rawData = historyResult.success && historyResult.data ? historyResult.data : null;
  const groups = rawData?.groups ?? [];
  const summary = (rawData?.summary ?? defaultSummary) as ProductionHistorySummary;
  const filterOptions = filterOptionsResult.success && filterOptionsResult.data ? filterOptionsResult.data : { machines: [], operators: [], shifts: [], products: [] };

  // Filter aktif hanya jika ada flag/q/dropdown, bukan sekadar from/to
  const hasActiveFilter = q || machineId || operatorId || shiftId || productVariantId || hasScrap || missingPhoto || includeVoided;
  // Cek apakah from/to bukan default "hari ini" (perbandingan kasar)
  const fromToIsDefault =
    !from && !to;
  const scrapPct = summary.totalGood + summary.totalScrap > 0
    ? ((summary.totalScrap / (summary.totalGood + summary.totalScrap)) * 100).toFixed(1)
    : '0.0';
  const kpiCaption = hasActiveFilter ? 'Dari filter aktif' : fromToIsDefault ? 'Hari ini WIB' : 'Sesuai rentang tanggal';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Log Hasil Produksi</h2>
          <p className="text-muted-foreground">
            Dokumentasi output per entri — verifikasi, bukti foto, koreksi.
          </p>
        </div>
      </div>

      <Suspense fallback={null}>
        <ProductionHistoryFilters filterOptions={filterOptions} />
      </Suspense>

      {/* KPI — terikat filter aktif */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="shadow-sm bg-card/65 backdrop-blur-sm">
          <CardHeader className="pb-1 pt-4">
            <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Package className="h-3 w-3" />
              Hasil Bersih
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="text-2xl font-extrabold tabular-nums">
              {summary.totalGood.toLocaleString()}
            </div>
            <div className="text-[11px] mt-1.5 text-muted-foreground">
              {kpiCaption}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm bg-card/65 backdrop-blur-sm">
          <CardHeader className="pb-1 pt-4">
            <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3" />
              Scrap
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="text-2xl font-extrabold tabular-nums text-destructive">
              {summary.totalScrap.toLocaleString()}
              <span className="text-xs font-normal text-muted-foreground ml-1">{scrapPct}%</span>
            </div>
            <div className="text-[11px] mt-1.5 text-muted-foreground">
              dari total output
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm bg-card/65 backdrop-blur-sm">
          <CardHeader className="pb-1 pt-4">
            <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <FileText className="h-3 w-3" />
              Entri / SPK
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="text-2xl font-extrabold tabular-nums">
              {summary.executionCount}
              <span className="text-xs font-normal text-muted-foreground ml-1">/ {summary.orderCount}</span>
            </div>
            <div className="text-[11px] mt-1.5 text-muted-foreground">
              log / order
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm bg-card/65 backdrop-blur-sm">
          <CardHeader className="pb-1 pt-4">
            <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Camera className="h-3 w-3" />
              Tanpa Foto
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="text-2xl font-extrabold tabular-nums text-amber-600">
              {summary.missingPhotoCount}
            </div>
            <div className="text-[11px] mt-1.5 text-muted-foreground">
              SPK tanpa bukti foto
            </div>
          </CardContent>
        </Card>
      </div>

      {summary.isTruncated && (
        <p className="text-xs text-muted-foreground text-center -mt-2">
          Menampilkan {summary.executionCount} entri teratas (batas {summary.limit}). Ubah filter untuk menyempitkan.
        </p>
      )}

      {/* List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Aktivitas Produksi</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div className="text-center py-10 text-muted-foreground italic">Memuat…</div>}>
            <ProductionHistoryClient groups={groups} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
