"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils/utils";

interface BreadcrumbSegment {
  label: string;
  href: string;
  isLast: boolean;
}

// Known path labels — add more as routes grow
const PATH_LABELS: Record<string, string> = {
  // Workspaces
  dashboard: "Dashboard",
  sales: "Penjualan",
  planning: "Planning",
  production: "Produksi",
  warehouse: "Gudang",
  finance: "Finance",
  admin: "Admin",
  kiosk: "Kiosk",

  // Dashboard children
  products: "Katalog Produk",
  boms: "BOM / Formula",
  machines: "Mesin",
  employees: "Karyawan",
  maklon: "Maklon",
  receipts: "Penerimaan",
  returns: "Retur",
  settings: "Pengaturan",

  // Sales
  quotations: "Penawaran",
  orders: "Sales Order",
  invoices: "Invoice",
  deliveries: "Surat Jalan",
  customers: "Customer",

  // Planning
  requests: "Permintaan Masuk",
  schedule: "Jadwal Produksi",
  mrp: "Kebutuhan Material",
  "purchase-requests": "Permintaan Pembelian",
  "purchase-orders": "Purchase Order",
  "purchase-returns": "Retur Pembelian",
  suppliers: "Supplier",
  "production-analytics": "Analitik Produksi",
  "procurement-analytics": "Analitik Procurement",

  // Production
  inventory: "Stok",
  resources: "Tim / Shift",
  history: "Log Riwayat",
  shifts: "Shift Kerja",
  costing: "Costing",
  "packing-monthly": "Laporan Packing",

  // Warehouse
  incoming: "Penerimaan Barang",
  outgoing: "Barang Keluar",
  opname: "Stock Opname",
  transfer: "Transfer Stok",
  adjustment: "Penyesuaian Stok",
  aging: "Aging",
  locations: "Lokasi",

  // Finance
  "petty-cash": "Petty Cash",
  "bank-reconciliation": "Rekonsiliasi Bank",
  "fixed-assets": "Aset Tetap",
  budgeting: "Anggaran",
  "foh-allocation": "Alokasi FOH",
  "hpp-report": "Laporan HPP",
  "quick-entry": "Quick Entry",
  reports: "Laporan",
  journals: "Jurnal",
  assets: "Aset Tetap",
  coa: "Bagan Akun",
  periods: "Periode Fiskal",
  "opening-balance": "Saldo Awal",
  payments: "Pembayaran",
  received: "Diterima",
  sent: "Dikirim",

  // Reports
  "balance-sheet": "Neraca",
  "income-statement": "Laba Rugi",
  "cash-flow": "Arus Kas",
  "trial-balance": "Neraca Saldo",
  "budget-variance": "Varians Anggaran",
  tax: "Pajak",
  daily: "Harian",
};

function getLabel(segment: string): string {
  // Check exact match first
  if (PATH_LABELS[segment]) return PATH_LABELS[segment];
  // Check if it looks like a dynamic segment (ID)
  if (/^[a-z0-9-]{20,}$/i.test(segment) || /^\d+$/.test(segment))
    return "Detail";
  // Fallback: capitalize
  return segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ");
}

function buildBreadcrumbs(pathname: string): BreadcrumbSegment[] {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: BreadcrumbSegment[] = [];

  for (let i = 0; i < segments.length; i++) {
    const href = "/" + segments.slice(0, i + 1).join("/");
    const label = getLabel(segments[i]);
    crumbs.push({ label, href, isLast: i === segments.length - 1 });
  }

  return crumbs;
}

interface PathBreadCrumbProps {
  className?: string;
}

export function PathBreadCrumb({ className }: PathBreadCrumbProps) {
  const pathname = usePathname();
  const crumbs = buildBreadcrumbs(pathname);

  // Don't show breadcrumbs for root dashboard
  if (pathname === "/dashboard") return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        "flex items-center gap-1 text-sm text-muted-foreground mb-4",
        className,
      )}
    >
      <Link
        href="/dashboard"
        className="hover:text-foreground transition-colors flex items-center gap-1"
      >
        <Home className="h-3.5 w-3.5" />
      </Link>
      {crumbs.map((crumb) => (
        <span key={crumb.href} className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3 opacity-50" />
          {crumb.isLast ? (
            <span className="text-foreground font-medium">{crumb.label}</span>
          ) : (
            <Link
              href={crumb.href}
              className="hover:text-foreground transition-colors"
            >
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
