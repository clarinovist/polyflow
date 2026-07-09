import { ShippingCostReportClient } from "@/components/sales/reports/ShippingCostReportClient";

export default function ShippingCostReportPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Laporan Biaya Pengiriman
        </h1>
        <p className="text-muted-foreground">
          Analisa biaya pengiriman per armada, rute, dan periode.
        </p>
      </div>

      <ShippingCostReportClient />
    </div>
  );
}
