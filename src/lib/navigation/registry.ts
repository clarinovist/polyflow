/**
 * Navigation Registry — single source of truth for all portal nav items.
 *
 * This registry defines every nav entry across all portals.
 * Sidebars can optionally consume from this registry (future refactor).
 * The nav-integrity test uses this to catch duplicate hrefs within a portal.
 *
 * Design principles:
 * - 1 owner workspace per entity (source of truth)
 * - Multi-entry OK (alias with portal layout)
 * - Multi-copy CRUD NOT OK
 */

export type WorkspaceKey =
  | 'master'
  | 'sales'
  | 'production'
  | 'warehouse'
  | 'purchasing'
  | 'finance'
  | 'hrd'
  | 'maklon';

export type NavSection =
  | 'ringkasan'
  | 'transaksi'
  | 'pengiriman'
  | 'master'
  | 'maklon'
  | 'perencanaan'
  | 'lantai'
  | 'sumber-daya'
  | 'analitik'
  | 'operasi'
  | 'persediaan'
  | 'pelaporan';

export interface NavItem {
  /** Unique ID for this nav entry */
  id: string;
  /** Display label (Indonesian) */
  label: string;
  /** Route href */
  href: string;
  /** Which portal/sidebar this item belongs to */
  workspace: WorkspaceKey;
  /** Section/group within the sidebar */
  section: NavSection;
  /** Entity owner — which workspace owns the source of truth */
  owner: WorkspaceKey;
  /** If true, this is an alias pointing to another portal's route */
  isAlias?: boolean;
  /** The canonical href if this is an alias */
  canonicalHref?: string;
}

/**
 * Master Data / Main sidebar nav items
 */
const masterNavItems: NavItem[] = [
  // Modul links
  { id: 'master-sales', label: 'Penjualan', href: '/sales', workspace: 'master', section: 'ringkasan', owner: 'sales' },
  { id: 'master-purchasing', label: 'Pembelian', href: '/purchasing', workspace: 'master', section: 'ringkasan', owner: 'purchasing' },
  { id: 'master-production', label: 'Produksi', href: '/production', workspace: 'master', section: 'ringkasan', owner: 'production' },
  { id: 'master-inventory', label: 'Stok', href: '/warehouse', workspace: 'master', section: 'ringkasan', owner: 'warehouse' },
  { id: 'master-finance', label: 'Finance', href: '/finance', workspace: 'master', section: 'ringkasan', owner: 'finance' },
  { id: 'master-hrd', label: 'HRD', href: '/hrd', workspace: 'master', section: 'ringkasan', owner: 'hrd' },
  { id: 'master-maklon', label: 'Maklon', href: '/maklon', workspace: 'master', section: 'ringkasan', owner: 'warehouse' },
  // Master data
  { id: 'master-products', label: 'Katalog Produk', href: '/dashboard/products', workspace: 'master', section: 'master', owner: 'master' },
  { id: 'master-boms', label: 'BOM / Formula', href: '/dashboard/boms', workspace: 'master', section: 'master', owner: 'master' },
  { id: 'master-machines', label: 'Mesin (Master)', href: '/dashboard/machines', workspace: 'master', section: 'master', owner: 'master' },
  { id: 'master-employees', label: 'Karyawan', href: '/dashboard/employees', workspace: 'master', section: 'master', owner: 'master' },
];

/**
 * Sales sidebar nav items
 */
const salesNavItems: NavItem[] = [
  { id: 'sales-dashboard', label: 'Papan Sales', href: '/sales', workspace: 'sales', section: 'ringkasan', owner: 'sales' },
  { id: 'sales-mobile', label: 'Mode Mobile', href: '/sales/mobile', workspace: 'sales', section: 'ringkasan', owner: 'sales' },
  { id: 'sales-quotations', label: 'Penawaran', href: '/sales/quotations', workspace: 'sales', section: 'transaksi', owner: 'sales' },
  { id: 'sales-orders', label: 'Sales Order', href: '/sales/orders', workspace: 'sales', section: 'transaksi', owner: 'sales' },
  { id: 'sales-invoices', label: 'Invoice & Piutang', href: '/sales/invoices', workspace: 'sales', section: 'transaksi', owner: 'sales' },
  { id: 'sales-returns', label: 'Retur Penjualan', href: '/sales/returns', workspace: 'sales', section: 'transaksi', owner: 'sales' },
  { id: 'sales-delivery-schedules', label: 'Jadwal Kirim', href: '/sales/delivery-schedules', workspace: 'sales', section: 'pengiriman', owner: 'sales' },
  { id: 'sales-deliveries', label: 'Surat Jalan', href: '/sales/deliveries', workspace: 'sales', section: 'pengiriman', owner: 'sales' },
  { id: 'sales-vehicles', label: 'Armada', href: '/sales/vehicles', workspace: 'sales', section: 'pengiriman', owner: 'sales' },
  { id: 'sales-customers', label: 'Customer', href: '/sales/customers', workspace: 'sales', section: 'pelaporan', owner: 'sales' },
  { id: 'sales-shipping-cost', label: 'Biaya Pengiriman', href: '/sales/reports/shipping-cost', workspace: 'sales', section: 'pelaporan', owner: 'sales' },
  { id: 'sales-performance', label: 'Performa Penjualan', href: '/sales/reports/sales-performance', workspace: 'sales', section: 'pelaporan', owner: 'sales' },
];

/**
 * Production sidebar nav items
 */
const productionNavItems: NavItem[] = [
  { id: 'prod-overview', label: 'Papan Produksi', href: '/production', workspace: 'production', section: 'ringkasan', owner: 'production' },
  { id: 'prod-orders', label: 'SPK', href: '/production/orders', workspace: 'production', section: 'perencanaan', owner: 'production' },
  { id: 'prod-boms', label: 'BOM / Formula', href: '/production/boms', workspace: 'production', section: 'perencanaan', owner: 'master', isAlias: true, canonicalHref: '/dashboard/boms' },
  { id: 'prod-requests', label: 'Permintaan FG', href: '/production/requests', workspace: 'production', section: 'perencanaan', owner: 'production' },
  { id: 'prod-schedule', label: 'Jadwal', href: '/production/schedule', workspace: 'production', section: 'perencanaan', owner: 'production' },
  { id: 'prod-mrp', label: 'MRP', href: '/production/mrp', workspace: 'production', section: 'perencanaan', owner: 'production' },
  { id: 'prod-daily', label: 'SPK Aktif', href: '/production/daily', workspace: 'production', section: 'lantai', owner: 'production' },
  { id: 'prod-machines', label: 'Papan Mesin', href: '/production/machines', workspace: 'production', section: 'lantai', owner: 'production' },
  { id: 'prod-inventory', label: 'Stok Lantai', href: '/production/inventory', workspace: 'production', section: 'sumber-daya', owner: 'warehouse' },
  { id: 'prod-resources', label: 'Tim / Shift', href: '/production/resources', workspace: 'production', section: 'sumber-daya', owner: 'production' },
  { id: 'prod-history', label: 'Log Hasil', href: '/production/history', workspace: 'production', section: 'sumber-daya', owner: 'production' },
  { id: 'prod-packing', label: 'Laporan Packing', href: '/production/packing-monthly', workspace: 'production', section: 'sumber-daya', owner: 'production' },
  { id: 'prod-shifts', label: 'Shift Kerja', href: '/production/shifts', workspace: 'production', section: 'sumber-daya', owner: 'production' },
  { id: 'prod-analytics', label: 'Analitik Produksi', href: '/production/analytics', workspace: 'production', section: 'analitik', owner: 'production' },
  { id: 'prod-costing', label: 'Costing', href: '/production/costing', workspace: 'production', section: 'analitik', owner: 'production' },
  { id: 'prod-kiosk', label: 'Kiosk Operator', href: '/kiosk', workspace: 'production', section: 'analitik', owner: 'production' },
];

/**
 * Warehouse sidebar nav items
 */
const warehouseNavItems: NavItem[] = [
  { id: 'wh-home', label: 'Hari Ini', href: '/warehouse', workspace: 'warehouse', section: 'operasi', owner: 'warehouse' },
  { id: 'wh-incoming', label: 'Penerimaan Barang', href: '/warehouse/incoming', workspace: 'warehouse', section: 'operasi', owner: 'warehouse' },
  { id: 'wh-outgoing', label: 'Antrian Muat', href: '/warehouse/outgoing', workspace: 'warehouse', section: 'operasi', owner: 'sales' },
  { id: 'wh-materials', label: 'Bahan Produksi', href: '/warehouse/materials', workspace: 'warehouse', section: 'operasi', owner: 'warehouse' },
  { id: 'wh-opname', label: 'Stock Opname', href: '/warehouse/opname', workspace: 'warehouse', section: 'operasi', owner: 'warehouse' },
  { id: 'wh-maklon-receipts', label: 'Penerimaan Maklon', href: '/warehouse/maklon/receipts', workspace: 'warehouse', section: 'maklon', owner: 'warehouse' },
  { id: 'wh-maklon-returns', label: 'Retur Maklon', href: '/warehouse/maklon/returns', workspace: 'warehouse', section: 'maklon', owner: 'warehouse' },
  { id: 'wh-inventory', label: 'Stok', href: '/warehouse/inventory', workspace: 'warehouse', section: 'persediaan', owner: 'warehouse' },
  { id: 'wh-locations', label: 'Lokasi', href: '/warehouse/locations', workspace: 'warehouse', section: 'persediaan', owner: 'warehouse' },
  { id: 'wh-analytics', label: 'Analitik Gudang', href: '/warehouse/analytics', workspace: 'warehouse', section: 'analitik', owner: 'warehouse' },
];

/**
 * Purchasing sidebar nav items
 */
const purchasingNavItems: NavItem[] = [
  { id: 'purch-dashboard', label: 'Dashboard Pembelian', href: '/purchasing', workspace: 'purchasing', section: 'ringkasan', owner: 'purchasing' },
  { id: 'purch-requests', label: 'Permintaan Pembelian', href: '/purchasing/requests', workspace: 'purchasing', section: 'transaksi', owner: 'purchasing' },
  { id: 'purch-orders', label: 'Order Pembelian', href: '/purchasing/orders', workspace: 'purchasing', section: 'transaksi', owner: 'purchasing' },
  { id: 'purch-returns', label: 'Retur Pembelian', href: '/purchasing/returns', workspace: 'purchasing', section: 'transaksi', owner: 'purchasing' },
  { id: 'purch-suppliers', label: 'Supplier', href: '/purchasing/suppliers', workspace: 'purchasing', section: 'master', owner: 'purchasing' },
  { id: 'purch-maklon-monitor', label: 'Monitor Penerimaan Maklon', href: '/maklon/receipts', workspace: 'purchasing', section: 'maklon', owner: 'warehouse' },
  { id: 'purch-analytics', label: 'Analitik Pembelian', href: '/purchasing/analytics', workspace: 'purchasing', section: 'analitik', owner: 'purchasing' },
];

/**
 * All nav items across all portals.
 */
export const NAV_REGISTRY: NavItem[] = [
  ...masterNavItems,
  ...salesNavItems,
  ...productionNavItems,
  ...warehouseNavItems,
  ...purchasingNavItems,
];

/**
 * Get all nav items for a specific workspace/portal.
 */
export function getNavItemsForWorkspace(workspace: WorkspaceKey): NavItem[] {
  return NAV_REGISTRY.filter((item) => item.workspace === workspace);
}

/**
 * Find duplicate hrefs within a single portal (full href including query strings).
 * Returns array of { href, items } for each duplicate found.
 */
export function findDuplicateHrefs(): Array<{ href: string; items: NavItem[] }> {
  const byWorkspace = new Map<string, Map<string, NavItem[]>>();

  for (const item of NAV_REGISTRY) {
    if (!byWorkspace.has(item.workspace)) {
      byWorkspace.set(item.workspace, new Map());
    }
    const workspaceMap = byWorkspace.get(item.workspace)!;
    if (!workspaceMap.has(item.href)) {
      workspaceMap.set(item.href, []);
    }
    workspaceMap.get(item.href)!.push(item);
  }

  const duplicates: Array<{ href: string; items: NavItem[] }> = [];
  for (const [, hrefMap] of byWorkspace) {
    for (const [href, items] of hrefMap) {
      if (items.length > 1) {
        duplicates.push({ href, items });
      }
    }
  }
  return duplicates;
}
