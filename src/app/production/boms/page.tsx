import { getBoms } from "@/actions/production/boms";
import { canViewPrices } from "@/actions/admin/permissions";
import { BOMList } from "@/components/production/bom/BOMList";
import { BOMFieldGuide } from "@/components/production/BOMFieldGuide";
import { ProductionGlossary } from "@/components/production/ProductionGlossary";
import { Info, FileText } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function ProductionBomsPage() {
  const [bomsRes, showPrices] = await Promise.all([getBoms(undefined, 'ALL'), canViewPrices()]);

  const boms = bomsRes.success && bomsRes.data ? bomsRes.data : [];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">BOM / Formula</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Daftar Bill of Materials (BOM) dan formula produksi.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/finance/reports/hpp">
              <FileText className="mr-2 h-4 w-4" />
              Laporan HPP
            </Link>
          </Button>
          <ProductionGlossary />
          <BOMFieldGuide />
        </div>
      </div>

      <Alert className="bg-background border-emerald-500/20 text-emerald-600 dark:text-emerald-400 shadow-sm relative overflow-hidden">
        <div className="flex items-start gap-3 relative">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <AlertTitle className="font-bold tracking-tight">
              Portal Produksi
            </AlertTitle>
            <AlertDescription className="text-xs opacity-90">
              BOM dikelola dari Master Data. Edit dan buat formula baru tersedia di sini.
              Data sama dengan halaman Master Data.
            </AlertDescription>
          </div>
        </div>
      </Alert>

      <BOMList
        boms={boms}
        showPrices={showPrices.success ? showPrices.data : false}
      />
    </div>
  );
}
