export interface DateRange {
    from: Date;
    to: Date;
}

export interface ProductionRealizationItem {
    orderId: string;
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
export interface MachinePerformanceItem {
    machineId?: string;
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
    scrapByProduct: {
        productVariantId: string;
        productName: string;
        quantity: number;
        percentage: number;
        sampleProductionOrderId?: string;
    }[];
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
