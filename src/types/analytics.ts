export interface DateRange {
  from: Date;
  to: Date;
}

export interface ProductionRealizationItem {
  orderNumber: string;
  productName: string;
  plannedQuantity: number;
  actualQuantity: number;
  yieldRate: number; // percentage
  plannedEndDate: Date | null;
  actualEndDate: Date | null;
  status: string;
  scheduleAdherence: 'On Time' | 'Late' | 'Early' | 'Pending';
  delayDays: number;
}

export interface MaterialUsageVarianceItem {
  orderNumber: string;
  materialName: string;
  materialSku: string;
  standardQuantity: number;
  actualQuantity: number;
  variance: number;
  variancePercentage: number;
}

export interface MachinePerformanceItem {
  machineName: string;
  machineCode: string;
  totalOutput: number;
  totalOperatingHours: number;
  unitsPerHour: number;
  scrapRate: number; // percentage
  utilizationRate?: number; // Optional if we had available hours
}

export interface OperatorProductivityItem {
  operatorName: string;
  operatorCode: string;
  totalQuantityProduced: number;
  totalScrapQuantity: number;
  ordersHandled: number;
  scrapRate: number; // percentage
}

export interface QualityControlSummary {
  inspections: {
    total: number;
    pass: number;
    fail: number;
    quarantine: number;
    passRate: number;
  };
  scrapByReason: {
    reason: string;
    quantity: number;
    percentage: number; // % of total scrap
  }[];
}

// ============================================
// SALES ANALYTICS TYPES
// ============================================

export interface SalesRevenueItem {
  period: string; // "Jan 2024", "Feb 2024", etc.
  revenue: number;
  orderCount: number;
  aov: number; // Average Order Value
}

export interface SalesRevenueTrend {
  revenueGrowth: number; // Percentage vs previous period
  orderCountGrowth: number;
  chartData: SalesRevenueItem[];
}

export interface TopCustomerItem {
  customerId: string;
  customerName: string;
  totalSpent: number;
  orderCount: number;
  lastOrderDate: Date | null;
}

export interface TopProductItem {
  productVariantId: string;
  productName: string;
  skuCode: string;
  totalQuantity: number;
  totalRevenue: number;
}

export interface SalesPipelineSummary {
  status: string;
  count: number;
  value: number;
  percentage: number;
}

export interface ARAgingItem {
  range: 'Current' | '1-30 Days' | '31-60 Days' | '61-90 Days' | '> 90 Days';
  amount: number;
  invoiceCount: number;
}

export interface CustomerCreditItem {
  customerName: string;
  creditLimit: number;
  usedCredit: number; // Total unpaid invoices
  utilizationRate: number; // % used
  status: 'Safe' | 'Warning' | 'Critical'; // Based on utilization > 80%?
}

// ============================================
// PURCHASING ANALYTICS TYPES
// ============================================

export interface PurchaseSpendItem {
  period: string; // "Jan 2024"
  spend: number;
  orderCount: number;
}

export interface PurchaseSpendTrend {
  spendGrowth: number;
  orderCountGrowth: number;
  periodSpend: number;
  periodOrderCount: number;
  chartData: PurchaseSpendItem[];
}

export interface TopSupplierItem {
  supplierId: string;
  supplierName: string;
  totalSpend: number;
  orderCount: number;
  lastOrderDate: Date | null;
}

export interface PurchaseByStatusItem {
  status: string;
  count: number;
  value: number; // Total amount in that status
  percentage: number;
}

export interface APAgingItem {
  range: 'Current' | '1-30 Days' | '31-60 Days' | '61-90 Days' | '> 90 Days';
  amount: number;
  invoiceCount: number;
}
