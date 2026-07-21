/**
 * Single source of truth for the Access Control matrix (Settings) and,
 * eventually, per-portal nav filtering.
 *
 * See docs/plans/2026-07-20-granular-access-control.md section 4.
 * Resource keys are stored verbatim in RolePermission.resource — plain
 * URL paths (or `feature:*` flags), no separate enum.
 */
export type PermissionNode = {
  key: string;
  label: string;
  description?: string;
  children?: PermissionNode[];
  /** true = rendered in the separate feature-flag table, not the module tree */
  isFeature?: boolean;
};

export const PERMISSION_CATALOG: PermissionNode[] = [
  {
    key: "/dashboard",
    label: "Dashboard",
    children: [
      { key: "/dashboard/products", label: "Katalog Produk" },
      { key: "/dashboard/boms", label: "BOM / Formula" },
      { key: "/dashboard/machines", label: "Mesin (Master)" },
      { key: "/dashboard/employees", label: "Karyawan (Master)" },
    ],
  },
  {
    key: "/sales",
    label: "Sales",
    children: [
      { key: "/sales/mobile", label: "Tampilan Mobile" },
      { key: "/sales/quotations", label: "Quotation" },
      { key: "/sales/orders", label: "Sales Order" },
      { key: "/sales/invoices", label: "Invoice Penjualan" },
      { key: "/sales/returns", label: "Retur Penjualan" },
      { key: "/sales/delivery-schedules", label: "Jadwal Kirim" },
      { key: "/sales/deliveries", label: "Delivery / SJ" },
      { key: "/sales/vehicles", label: "Armada" },
      { key: "/sales/customers", label: "Pelanggan" },
      { key: "/sales/reports/shipping-cost", label: "Laporan Biaya Kirim" },
      { key: "/sales/reports/sales-performance", label: "Performa Penjualan" },
      { key: "/sales/analytics", label: "Analytics" },
    ],
  },
  {
    key: "/purchasing",
    label: "Purchasing",
    children: [
      { key: "/purchasing/requests", label: "Purchase Request" },
      { key: "/purchasing/orders", label: "Purchase Order" },
      { key: "/purchasing/returns", label: "Retur Pembelian" },
      { key: "/purchasing/suppliers", label: "Supplier" },
      { key: "/purchasing/analytics", label: "Analitik Purchasing" },
    ],
  },
  {
    key: "/production",
    label: "Production",
    children: [
      { key: "/production/orders", label: "Work Order / SPK" },
      { key: "/production/boms", label: "BOM (alias production)" },
      { key: "/production/requests", label: "Permintaan Masuk" },
      { key: "/production/schedule", label: "Jadwal Produksi" },
      { key: "/production/mrp", label: "MRP" },
      { key: "/production/daily", label: "Produksi Harian" },
      { key: "/production/machines", label: "Board Mesin" },
      { key: "/production/inventory", label: "Stok Lantai" },
      { key: "/production/resources", label: "Tim & Shift Resource" },
      { key: "/production/history", label: "Log Output" },
      { key: "/production/packing-monthly", label: "Packing Bulanan" },
      { key: "/production/shifts", label: "Work Shift" },
      { key: "/production/analytics", label: "Analitik Produksi" },
      { key: "/production/costing", label: "Costing" },
      { key: "/kiosk", label: "Operator Kiosk" },
    ],
  },
  {
    key: "/warehouse",
    label: "Stok / Gudang",
    children: [
      { key: "/warehouse/incoming", label: "Penerimaan" },
      { key: "/warehouse/outgoing", label: "Pengeluaran" },
      { key: "/warehouse/opname", label: "Stock Opname" },
      { key: "/warehouse/maklon/receipts", label: "Penerimaan Maklon (WH)" },
      { key: "/warehouse/maklon/returns", label: "Retur Maklon (WH)" },
      {
        key: "/warehouse/inventory",
        label: "Lihat Stok (overview)",
        children: [
          { key: "/warehouse/inventory/transfer", label: "Transfer Stok" },
          { key: "/warehouse/inventory/adjustment", label: "Adjustment" },
          { key: "/warehouse/inventory/aging", label: "Aging" },
          { key: "/warehouse/inventory/history", label: "Riwayat Mutasi" },
        ],
      },
      { key: "/warehouse/locations", label: "Lokasi Gudang" },
      { key: "/warehouse/analytics", label: "Analitik Gudang" },
    ],
  },
  {
    key: "/finance",
    label: "Finance",
    children: [
      { key: "/finance/petty-cash", label: "Petty Cash" },
      { key: "/finance/bank-reconciliation", label: "Rekonsiliasi Bank" },
      { key: "/finance/aging", label: "Aging AR/AP" },
      { key: "/finance/quick-entry", label: "Quick Entry" },
      { key: "/finance/invoices/sales", label: "Piutang" },
      { key: "/finance/payments/received", label: "Penerimaan Customer" },
      { key: "/finance/invoices/purchase", label: "Hutang" },
      { key: "/finance/payments/sent", label: "Pembayaran Supplier" },
      { key: "/finance/journals", label: "Jurnal" },
      { key: "/finance/assets", label: "Aset Tetap" },
      { key: "/finance/foh-allocation", label: "Alokasi FOH" },
      { key: "/finance/budgeting", label: "Budgeting" },
      {
        key: "/finance/reports",
        label: "Semua Laporan",
        children: [
          { key: "/finance/reports/balance-sheet", label: "Neraca" },
          { key: "/finance/reports/income-statement", label: "Laba Rugi" },
          { key: "/finance/reports/cash-flow", label: "Arus Kas" },
          { key: "/finance/reports/trial-balance", label: "Trial Balance" },
          { key: "/finance/reports/general-ledger", label: "Buku Besar" },
          { key: "/finance/reports/hpp", label: "HPP" },
          { key: "/finance/reports/tax", label: "Pajak" },
          { key: "/finance/reports/maklon", label: "Profitabilitas Maklon" },
        ],
      },
      {
        key: "/finance/coa",
        label: "COA",
        children: [{ key: "/finance/coa/roles", label: "Role Mapping COA" }],
      },
      { key: "/finance/periods", label: "Periode Fiskal" },
      { key: "/finance/opening-balance", label: "Saldo Awal" },
      { key: "/finance/payment-banks", label: "Bank Pembayaran" },
    ],
  },
  {
    key: "/hrd",
    label: "HRD",
    children: [
      { key: "/hrd/attendance", label: "Kehadiran" },
      { key: "/hrd/alerts", label: "Alert Absensi" },
      { key: "/hrd/payroll", label: "Payroll Harian/Piece" },
      { key: "/hrd/payroll-monthly", label: "Payroll Bulanan" },
      { key: "/hrd/bpjs", label: "Rekap BPJS" },
      { key: "/hrd/piece-rates", label: "Tarif Borongan" },
      { key: "/hrd/loans", label: "Kasbon" },
      { key: "/hrd/leave", label: "Cuti" },
      { key: "/hrd/disciplinary", label: "Disiplin" },
    ],
  },
  {
    key: "/maklon",
    label: "Maklon",
    children: [
      { key: "/maklon/receipts", label: "Penerimaan Maklon" },
      { key: "/maklon/returns", label: "Retur Maklon" },
    ],
  },
];

const FEATURE_CATALOG: PermissionNode[] = [
  { key: "feature:view-prices", label: "Lihat Harga", isFeature: true },
];

/** Flattens the tree (module + nested); does not include feature flags. */
export function flattenCatalog(
  nodes: PermissionNode[] = PERMISSION_CATALOG,
): PermissionNode[] {
  return nodes.flatMap((node) => [
    { key: node.key, label: node.label },
    ...(node.children ? flattenCatalog(node.children) : []),
  ]);
}

/** Root module resource for a given path, e.g. `/warehouse/inventory` -> `/warehouse`. */
export function getModuleRoot(path: string): string | null {
  const segments = path.split("/").filter(Boolean);
  return segments.length ? `/${segments[0]}` : null;
}

export function getFeatureCatalog(): PermissionNode[] {
  return FEATURE_CATALOG;
}
