// Re-exports for backward compatibility.
// New code should import from specific domain files:
//   production-orders, production-execution, production-materials,
//   production-issues, production-inspection, production-shifts,
//   production-mrp, production-child, production-downtime

export {
  getInitData,
  getProductionFormData,
  createProductionOrder,
  quickCreateProductionOrder,
  getProductionOrders,
  getProductionOrder,
  updateProductionOrder,
  deleteProductionOrder,
  getProductionOrderStats,
} from "./production-orders";

export {
  startExecution,
  stopExecution,
  addProductionOutput,
  logRunningOutput,
  getActiveExecutions,
  voidProductionOutput,
} from "./production-execution";

export {
  batchIssueMaterials,
  recordMaterialIssue,
  deleteMaterialIssue,
  recordScrap,
  deleteScrap,
} from "./production-materials";

export {
  createProductionIssue,
  updateProductionIssueStatus,
  deleteProductionIssue,
} from "./production-issues";

export { recordQualityInspection } from "./production-inspection";

export { addProductionShift, deleteProductionShift } from "./production-shifts";

export {
  getBomWithInventory,
  createProductionFromSalesOrder,
  simulateMrp,
  cancelOrderFromPlanning,
} from "./production-mrp";

export { createChildProductionOrder } from "./production-child";

export { logMachineDowntime } from "./production-downtime";
