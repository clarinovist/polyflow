/**
 * Label progres berbahasa manusia untuk setiap tool.
 *
 * Dipakai oleh jalur streaming supaya user melihat "Mengecek stok gudang…"
 * alih-alih nama teknis `get_product_stock` — atau, sebelum ini ada, layar
 * kosong selama 9–23 detik.
 */

const TOOL_LABELS: Record<string, string> = {
    get_product_stock: 'Mengecek stok barang',
    get_sales_order_lines: 'Membuka detail sales order',
    get_finance_summary: 'Merangkum data keuangan',
    get_finance_reconciliation: 'Merekonsiliasi laba-rugi dan COGS',
    get_active_production: 'Mengecek produksi berjalan',
    get_general_stock_overview: 'Melihat ringkasan stok',
    get_critical_stock_overview: 'Mengecek stok kritis',
    get_pending_sales_overview: 'Mengecek pesanan tertunda',
    search_help_articles: 'Mencari panduan di Knowledge Base',
    get_delivery_status: 'Mengecek status pengiriman',
    get_invoice_status: 'Mengecek status invoice',
    get_purchase_order: 'Membuka data purchase order',
    get_stock_movements: 'Menelusuri pergerakan stok',
    diagnose_so_fulfillment: 'Menelusuri kenapa SO tertahan',
    diagnose_stock_discrepancy: 'Menelusuri selisih stok',
    get_attendance_summary: 'Mengecek data absensi',
    diagnose_production_blocker: 'Menelusuri hambatan produksi',
    get_production_priority_briefing: 'Menyusun briefing prioritas produksi',
    diagnose_po_invoice_mismatch: 'Membandingkan PO dengan invoice',
    diagnose_invoice_payment: 'Menelusuri pembayaran invoice',
};

/** Label ramah untuk sebuah tool; fallback generik bila belum terdaftar. */
export function getToolLabel(toolName: string): string {
    return TOOL_LABELS[toolName] ?? 'Mengambil data terkait';
}
