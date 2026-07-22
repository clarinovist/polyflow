/** Purchasing types and constants — separated from 'use server' file. */

/** PR older than this threshold (days) are highlighted as aging. */
export const PR_AGING_THRESHOLD_DAYS = 7;

export interface SuggestedReorderItem {
  id: string;
  name: string;
  skuCode: string;
  supplierName: string | null;
  totalStock: number;
  reorderPoint: number | null;
  reorderQuantity: number | null;
}

export interface PurchasingShiftBoard {
  counts: {
    pendingPrs: number;
    draftPos: number;
    awaitingReceiptPos: number;
    partialPos: number;
    overdueApCount: number;
    overdueApAmount: number;
    monthlySpend: number;
  };
  attention: {
    agingPrs: Array<{ id: string; requestNumber: string; daysOld: number; status: string }>;
    draftPos: Array<{ id: string; orderNumber: string; supplierName: string; daysOld: number }>;
    awaitingReceipt: Array<{ id: string; orderNumber: string; supplierName: string }>;
    partialPos: Array<{ id: string; orderNumber: string; supplierName: string }>;
    overdueAp: Array<{ id: string; invoiceNumber: string; supplierName: string; remaining: number; dueDate: string }>;
    suggestedReorder: SuggestedReorderItem[];
  };
  performance: {
    monthlySpend: number;
    topSupplierName: string | null;
    topSupplierSpend: number;
  };
}
