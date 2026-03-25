import { prisma } from "@/lib/core/prisma";
import { CreateSalesReturnValues, UpdateSalesReturnValues } from "@/lib/schemas/returns";
import { SalesReturnStatus, MovementType } from "@prisma/client";
import { format } from "date-fns";
import { logActivity } from "@/lib/tools/audit";
import { AutoJournalService } from "../finance/auto-journal-service";

export class SalesReturnService {

  static async generateReturnNumber(): Promise<string> {
    const dateStr = format(new Date(), 'yyyyMMdd');
    const prefix = `SR-${dateStr}-`;

    const lastReturn = await prisma.salesReturn.findFirst({
      where: { returnNumber: { startsWith: prefix } },
      orderBy: { returnNumber: 'desc' },
    });

    let nextSequence = 1;
    if (lastReturn) {
      const parts = lastReturn.returnNumber.split('-');
      const lastSeq = parseInt(parts[2]);
      if (!isNaN(lastSeq)) {
        nextSequence = lastSeq + 1;
      }
    }

    return `${prefix}${nextSequence.toString().padStart(4, '0')}`;
  }

  static async createReturn(data: CreateSalesReturnValues, userId: string) {
    const returnNumber = await this.generateReturnNumber();

    let totalAmount = 0;
    for (const item of data.items) {
      totalAmount += item.returnedQty * item.unitPrice;
    }

    const salesReturn = await prisma.salesReturn.create({
      data: {
        returnNumber,
        salesOrderId: data.salesOrderId,
        deliveryOrderId: data.deliveryOrderId,
        customerId: data.customerId,
        returnLocationId: data.returnLocationId,
        reason: data.reason,
        notes: data.notes,
        totalAmount,
        status: SalesReturnStatus.DRAFT,
        createdById: userId,
        items: {
          create: data.items.map(item => ({
            productVariantId: item.productVariantId,
            returnedQty: item.returnedQty,
            unitPrice: item.unitPrice,
            reason: item.reason,
            condition: item.condition,
            notes: item.notes,
          }))
        }
      },
      include: {
        items: true,
      }
    });

    await logActivity({
      userId,
      action: 'CREATE_SALES_RETURN',
      entityType: 'SalesReturn',
      entityId: salesReturn.id,
      details: `Created draft Sales Return ${returnNumber}`
    });

    return salesReturn;
  }

  static async updateReturn(data: UpdateSalesReturnValues, userId: string) {
    if (!data.id) throw new Error("Return ID is required");
    
    const existing = await prisma.salesReturn.findUnique({ where: { id: data.id } });
    if (!existing) throw new Error("Sales Return not found");
    if (existing.status !== 'DRAFT') throw new Error("Can only update DRAFT returns");

    let totalAmount = existing.totalAmount ? Number(existing.totalAmount) : 0;
    
    const updateData: Record<string, unknown> = {
      salesOrderId: data.salesOrderId,
      deliveryOrderId: data.deliveryOrderId,
      customerId: data.customerId,
      returnLocationId: data.returnLocationId,
      reason: data.reason,
      notes: data.notes,
    };

    if (data.items) {
      totalAmount = data.items.reduce((sum, item) => sum + (item.returnedQty * item.unitPrice), 0);
      updateData.totalAmount = totalAmount;
      updateData.items = {
        deleteMany: {},
        create: data.items.map(item => ({
          productVariantId: item.productVariantId,
          returnedQty: item.returnedQty,
          unitPrice: item.unitPrice,
          reason: item.reason,
          condition: item.condition,
          notes: item.notes,
        }))
      };
    }

    const salesReturn = await prisma.salesReturn.update({
      where: { id: data.id },
      data: updateData,
    });

    await logActivity({
      userId,
      action: 'UPDATE_SALES_RETURN',
      entityType: 'SalesReturn',
      entityId: salesReturn.id,
      details: `Updated Sales Return ${salesReturn.returnNumber}`
    });

    return salesReturn;
  }

  static async confirmReturn(id: string, userId: string) {
    const existing = await prisma.salesReturn.findUnique({ where: { id } });
    if (!existing) throw new Error("Return not found");
    if (existing.status !== 'DRAFT') throw new Error("Only DRAFT returns can be confirmed");

    const updated = await prisma.salesReturn.update({
      where: { id },
      data: { status: SalesReturnStatus.CONFIRMED },
    });

    await logActivity({
      userId,
      action: 'CONFIRM_SALES_RETURN',
      entityType: 'SalesReturn',
      entityId: id,
      details: `Confirmed Sales Return ${existing.returnNumber}`
    });

    return updated;
  }

  static async receiveReturn(id: string, userId: string) {
    const salesReturn = await prisma.salesReturn.findUnique({
      where: { id },
      include: { items: true, salesOrder: true }
    });

    if (!salesReturn) throw new Error("Return not found");
    if (salesReturn.status !== 'CONFIRMED') throw new Error("Only CONFIRMED returns can be received");

    // Process receiving in transaction
    await prisma.$transaction(async (tx) => {
      // 1. Update Return Status
      await tx.salesReturn.update({
        where: { id },
        data: { status: SalesReturnStatus.RECEIVED }
      });

      // 2. Process Inventory & Movements
      for (const item of salesReturn.items) {
        // If condition is GOOD, we restock to inventory
        if (item.condition === 'GOOD') {
          await tx.inventory.upsert({
            where: {
              locationId_productVariantId: {
                locationId: salesReturn.returnLocationId,
                productVariantId: item.productVariantId,
              }
            },
            update: {
              quantity: { increment: item.returnedQty }
            },
            create: {
              locationId: salesReturn.returnLocationId,
              productVariantId: item.productVariantId,
              quantity: item.returnedQty,
            }
          });
        }

        // Record stock movement (RETURN_IN) regardless of condition, 
        // but if damaged, maybe it goes to a different logical state, 
        // for now we just record it to the returnLocation.
        await tx.stockMovement.create({
          data: {
            productVariantId: item.productVariantId,
            fromLocationId: null, // From Customer
            toLocationId: salesReturn.returnLocationId,
            quantity: item.returnedQty,
            type: MovementType.RETURN_IN,
            reference: salesReturn.returnNumber,
            createdById: userId,
          }
        });
      }

      await logActivity({
        userId,
        action: 'RECEIVE_SALES_RETURN',
        entityType: 'SalesReturn',
        entityId: id,
        details: `Received items for Sales Return ${salesReturn.returnNumber}`,
        tx
      });

    });

    // 3. Trigger Auto-Journal for Credit Note
    try {
      await AutoJournalService.handleSalesReturnReceived(id);
    } catch (error) {
      console.error("Failed to generate auto-journal for Sales Return:", error);
    }

    return this.getReturnById(id);
  }

  static async completeReturn(id: string, userId: string) {
    const existing = await prisma.salesReturn.findUnique({ where: { id } });
    if (!existing) throw new Error("Return not found");
    // Usually completed after received
    if (existing.status !== 'RECEIVED') throw new Error("Only RECEIVED returns can be completed");

    const updated = await prisma.salesReturn.update({
      where: { id },
      data: { status: SalesReturnStatus.COMPLETED },
    });

    await logActivity({
      userId,
      action: 'COMPLETE_SALES_RETURN',
      entityType: 'SalesReturn',
      entityId: id,
      details: `Completed Sales Return ${existing.returnNumber}`
    });

    return updated;
  }

  static async cancelReturn(id: string, userId: string) {
    const existing = await prisma.salesReturn.findUnique({ where: { id } });
    if (!existing) throw new Error("Return not found");
    if (existing.status === 'RECEIVED' || existing.status === 'COMPLETED') {
      throw new Error("Cannot cancel returns that are already processing or completed");
    }

    const updated = await prisma.salesReturn.update({
      where: { id },
      data: { status: SalesReturnStatus.CANCELLED },
    });

    await logActivity({
      userId,
      action: 'CANCEL_SALES_RETURN',
      entityType: 'SalesReturn',
      entityId: id,
      details: `Cancelled Sales Return ${existing.returnNumber}`
    });

    return updated;
  }

  static async getReturns(filters?: { status?: SalesReturnStatus, customerId?: string, search?: string }) {
    const where: Record<string, unknown> = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.customerId) where.customerId = filters.customerId;
    if (filters?.search) {
      where.OR = [
        { returnNumber: { contains: filters.search, mode: 'insensitive' } },
        { salesOrder: { orderNumber: { contains: filters.search, mode: 'insensitive' } } }
      ];
    }

    return prisma.salesReturn.findMany({
      where,
      include: {
        customer: true,
        salesOrder: { select: { orderNumber: true } },
        _count: { select: { items: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  static async getReturnById(id: string) {
    return prisma.salesReturn.findUnique({
      where: { id },
      include: {
        customer: true,
        salesOrder: true,
        deliveryOrder: true,
        returnLocation: true,
        createdBy: { select: { name: true } },
        items: {
          include: {
            productVariant: {
              include: { product: true }
            }
          }
        }
      }
    });
  }
}
