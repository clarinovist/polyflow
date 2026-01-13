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
