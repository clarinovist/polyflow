import type { ProductionCost } from "@/services/accounting/costing-service";

// ---- Types ----

export interface HppProductRow {
  bomId: string;
  bomName: string;
  productName: string;
  productSku: string | null;
  category: string | null;
  totalQuantity: number;
  orderCount: number;
  materialPerUnit: number;
  laborPerUnit: number;
  machinePerUnit: number;
  hppPerUnit: number;
  standardCost: number;
  varianceAmount: number;
  variancePercent: number;
}

export interface HppOrderRow {
  orderId: string;
  orderNumber: string;
  bomId: string;
  productName: string;
  productSku: string | null;
  quantity: number;
  materialCost: number;
  laborCost: number;
  machineCost: number;
  totalCost: number;
  unitCost: number;
}

export interface HppSummary {
  totalCogm: number;
  totalQuantity: number;
  materialShare: number;
  laborShare: number;
  machineShare: number;
  productCount: number;
  orderCount: number;
}

export interface HppReportData {
  summary: HppSummary;
  products: HppProductRow[];
  orders: HppOrderRow[];
}

// Enriched type from server action
export interface EnrichedProductionCost extends ProductionCost {
  bomId: string;
  bomName: string;
  productName: string;
  productSku: string | null;
  category: string | null;
  standardCost: number;
}

// ---- Aggregation ----

export function aggregateHppReport(
  orders: EnrichedProductionCost[],
): HppReportData {
  // Group orders by bomId
  const grouped = new Map<string, EnrichedProductionCost[]>();
  for (const order of orders) {
    const existing = grouped.get(order.bomId) ?? [];
    existing.push(order);
    grouped.set(order.bomId, existing);
  }

  // Build per-product rows
  const products: HppProductRow[] = [];
  for (const [bomId, bomOrders] of grouped) {
    const first = bomOrders[0];
    const totalQuantity = bomOrders.reduce(
      (sum, o) => sum + o.quantityProduced,
      0,
    );

    if (totalQuantity <= 0) continue;

    // Weighted average: sum(cost * qty) / sum(qty)
    const totalMaterial = bomOrders.reduce((sum, o) => sum + o.materialCost, 0);
    const totalLabor = bomOrders.reduce((sum, o) => sum + o.laborCost, 0);
    const totalMachine = bomOrders.reduce((sum, o) => sum + o.machineCost, 0);

    const materialPerUnit = totalMaterial / totalQuantity;
    const laborPerUnit = totalLabor / totalQuantity;
    const machinePerUnit = totalMachine / totalQuantity;
    const hppPerUnit = materialPerUnit + laborPerUnit + machinePerUnit;

    const standardCost = first.standardCost;
    const varianceAmount = hppPerUnit - standardCost;
    const variancePercent =
      standardCost > 0 ? (varianceAmount / standardCost) * 100 : 0;

    products.push({
      bomId,
      bomName: first.bomName,
      productName: first.productName,
      productSku: first.productSku,
      category: first.category,
      totalQuantity,
      orderCount: bomOrders.length,
      materialPerUnit,
      laborPerUnit,
      machinePerUnit,
      hppPerUnit,
      standardCost,
      varianceAmount,
      variancePercent,
    });
  }

  // Sort by product name
  products.sort((a, b) => a.productName.localeCompare(b.productName));

  // Build order detail rows
  const ordersList: HppOrderRow[] = orders.map((o) => ({
    orderId: o.productionOrderId,
    orderNumber: o.orderNumber,
    bomId: o.bomId,
    productName: o.productName,
    productSku: o.productSku,
    quantity: o.quantityProduced,
    materialCost: o.materialCost,
    laborCost: o.laborCost,
    machineCost: o.machineCost,
    totalCost: o.totalCost,
    unitCost: o.unitCost,
  }));

  // Sort by order number
  ordersList.sort((a, b) => a.orderNumber.localeCompare(b.orderNumber));

  // Summary
  const totalCogm = orders.reduce((sum, o) => sum + o.totalCost, 0);
  const totalMaterialAll = orders.reduce((sum, o) => sum + o.materialCost, 0);
  const totalLaborAll = orders.reduce((sum, o) => sum + o.laborCost, 0);
  const totalMachineAll = orders.reduce((sum, o) => sum + o.machineCost, 0);

  const summary: HppSummary = {
    totalCogm,
    totalQuantity: orders.reduce((sum, o) => sum + o.quantityProduced, 0),
    materialShare: totalCogm > 0 ? (totalMaterialAll / totalCogm) * 100 : 0,
    laborShare: totalCogm > 0 ? (totalLaborAll / totalCogm) * 100 : 0,
    machineShare: totalCogm > 0 ? (totalMachineAll / totalCogm) * 100 : 0,
    productCount: products.length,
    orderCount: orders.length,
  };

  return { summary, products, orders: ordersList };
}
