import { SalesPerformanceReportClient } from "@/components/sales/reports/SalesPerformanceReportClient";

export default function SalesPerformanceReportPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Laporan Performa Penjualan
        </h1>
        <p className="text-muted-foreground">
          Omzet per periode, top customer, top produk, dan detail order.
        </p>
      </div>

      <SalesPerformanceReportClient />
    </div>
  );
}
