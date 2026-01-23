import { ProductionOrderService } from './production/order-service';
import { ProductionExecutionService } from './production/execution-service';
import { ProductionMaterialService } from './production/material-service';
import { ProductionCostService } from './production/cost-service';

/**
 * Facade for Production sub-services.
 * Refactored into src/services/production/*.ts
 */
export class ProductionService {
    // --- Order Management ---
    static getInitData = ProductionOrderService.getInitData;
    static getBomWithInventory = ProductionOrderService.getBomWithInventory;
    static createOrder = ProductionOrderService.createOrder;
    static createOrderFromSales = ProductionOrderService.createOrderFromSales;
    static updateOrder = ProductionOrderService.updateOrder;
    static deleteOrder = ProductionOrderService.deleteOrder;
    static addShift = ProductionOrderService.addShift;
    static deleteShift = ProductionOrderService.deleteShift;

    // --- Execution & Monitoring ---
    static startExecution = ProductionExecutionService.startExecution;
    static stopExecution = ProductionExecutionService.stopExecution;
    static logRunningOutput = ProductionExecutionService.logRunningOutput;
    static addProductionOutput = ProductionExecutionService.addProductionOutput;
    static getActiveExecutions = ProductionExecutionService.getActiveExecutions;
    static recordDowntime = ProductionExecutionService.recordDowntime;

    // --- Materials & Quality ---
    static batchIssueMaterials = ProductionMaterialService.batchIssueMaterials;
    static recordMaterialIssue = ProductionMaterialService.recordMaterialIssue;
    static deleteMaterialIssue = ProductionMaterialService.deleteMaterialIssue;
    static recordScrap = ProductionMaterialService.recordScrap;
    static recordQualityInspection = ProductionMaterialService.recordQualityInspection;

    // --- Costing ---
    static calculateBatchCOGM = ProductionCostService.calculateBatchCOGM;
}
