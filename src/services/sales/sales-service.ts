import { CreateSalesOrderValues, UpdateSalesOrderValues } from '@/lib/schemas/sales';
import {
    getOrders,
    getOrderById,
    createOrder,
    updateOrder,
    confirmOrder,
    cancelOrder,
    deleteOrder
} from '@/services/sales/orders-service';
import { markReadyToShip, shipOrder, deliverOrder } from '@/services/sales/fulfillment-service';

export class SalesService {

    /**
     * Get All Sales Orders (Optimized)
     */
    static async getOrders(filters?: { customerId?: string, includeItems?: boolean, startDate?: Date, endDate?: Date }) {
        return getOrders(filters);
    }

    /**
     * Get Sales Order by ID (Optimized)
     */
    static async getOrderById(id: string) {
        return getOrderById(id);
    }

    static async createOrder(data: CreateSalesOrderValues, userId: string) {
        return createOrder(data, userId);
    }

    static async updateOrder(data: UpdateSalesOrderValues, _userId: string) {
        return updateOrder(data, _userId);
    }

    static async confirmOrder(id: string, userId: string) {
        return confirmOrder(id, userId);
    }

    static async markReadyToShip(id: string, userId: string) {
        return markReadyToShip(id, userId);
    }

    static async shipOrder(id: string, userId: string, trackingInfo?: { trackingNumber?: string, carrier?: string }) {
        return shipOrder(id, userId, trackingInfo);
    }

    static async deliverOrder(orderId: string, _userId: string) {
        return deliverOrder(orderId, _userId);
    }

    static async cancelOrder(id: string, userId: string) {
        return cancelOrder(id, userId);
    }
    static async deleteOrder(id: string) {
        return deleteOrder(id);
    }
}

