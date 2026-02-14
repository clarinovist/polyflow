import { PurchaseOrderStatus, Prisma } from '@prisma/client';
import {
    CreatePurchaseOrderValues,
    UpdatePurchaseOrderValues,
    CreateGoodsReceiptValues,
    CreatePurchaseInvoiceValues,
    CreatePurchaseRequestValues
} from '@/lib/schemas/purchasing';
import {
    createOrder,
    updateOrder,
    updateOrderStatus,
    deleteOrder,
    getPurchaseOrders,
    getPurchaseOrderById
} from './purchasing/orders-service';
import { createGoodsReceipt, getGoodsReceiptById, getGoodsReceipts } from './purchasing/receipts-service';
import {
    createInvoice,
    recordPayment,
    getPurchaseInvoiceById,
    getPurchaseInvoices,
    generateBillNumber,
    createDraftBillFromPo
} from './purchasing/invoices-service';
import { createPurchaseRequest, convertRequestToOrder, consolidateRequestsToOrder } from './purchasing/requests-service';
import { getPurchaseStats } from './purchasing/stats-service';

export class PurchaseService {

    static async createOrder(data: CreatePurchaseOrderValues, userId: string) {
        return createOrder(data, userId);
    }

    static async updateOrder(data: UpdatePurchaseOrderValues) {
        return updateOrder(data);
    }

    static async updateOrderStatus(id: string, status: PurchaseOrderStatus, userId: string) {
        return updateOrderStatus(id, status, userId);
    }

    static async deleteOrder(id: string, userId: string) {
        return deleteOrder(id, userId);
    }

    static async createGoodsReceipt(data: CreateGoodsReceiptValues, userId: string) {
        return createGoodsReceipt(data, userId);
    }

    static async createInvoice(data: CreatePurchaseInvoiceValues) {
        return createInvoice(data);
    }

    static async recordPayment(id: string, amount: number, userId: string) {
        return recordPayment(id, amount, userId);
    }

    static async getPurchaseOrders(filters?: { supplierId?: string, status?: PurchaseOrderStatus }) {
        return getPurchaseOrders(filters);
    }

    static async getPurchaseOrderById(id: string) {
        return getPurchaseOrderById(id);
    }

    static async getGoodsReceiptById(id: string) {
        return getGoodsReceiptById(id);
    }

    static async getGoodsReceipts(dateRange?: { startDate?: Date, endDate?: Date }) {
        return getGoodsReceipts(dateRange);
    }

    static async getPurchaseInvoiceById(id: string) {
        return getPurchaseInvoiceById(id);
    }

    static async getPurchaseInvoices(dateRange?: { startDate?: Date, endDate?: Date }) {
        return getPurchaseInvoices(dateRange);
    }

    static async generateBillNumber(): Promise<string> {
        return generateBillNumber();
    }

    static async createDraftBillFromPo(purchaseOrderId: string, userId: string) {
        return createDraftBillFromPo(purchaseOrderId, userId);
    }
    static async getPurchaseStats() {
        return getPurchaseStats();
    }

    static async createPurchaseRequest(data: CreatePurchaseRequestValues, userId: string, tx?: Prisma.TransactionClient) {
        return createPurchaseRequest(data, userId, tx);
    }

    static async convertRequestToOrder(requestId: string, supplierId: string, userId: string) {
        return convertRequestToOrder(requestId, supplierId, userId);
    }

    static async consolidateRequestsToOrder(requestIds: string[], supplierId: string, userId: string) {
        return consolidateRequestsToOrder(requestIds, supplierId, userId);
    }
}
