import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { InvoiceStatus, JournalStatus } from "@prisma/client";

import {
  generateInvoiceNumber,
  createInvoice,
  updateInvoiceStatus,
  createDraftInvoiceFromOrder,
} from "../invoice-lifecycle-service";
import { prisma } from "@/lib/core/prisma";
import { logger } from "@/lib/config/logger";
import { logActivity } from "@/lib/tools/audit";
import { AutoJournalService } from "../auto-journal-service";

// Mock prisma
vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    invoice: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    salesOrder: {
      findUnique: vi.fn(),
    },
    journalEntry: {
      updateMany: vi.fn(),
    },
  },
}));

// Mock audit
vi.mock("@/lib/tools/audit", () => ({
  logActivity: vi.fn(),
}));

// Mock auto-journal
vi.mock("../auto-journal-service", () => ({
  AutoJournalService: {
    handleSalesInvoiceCreated: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock logger
vi.mock("@/lib/config/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe("invoice-lifecycle-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Default to a fixed date: 2026-06-24
    vi.setSystemTime(new Date(2026, 5, 24));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("generateInvoiceNumber", () => {
    it("should generate invoice number with sequence 0001 when no prior invoices exist", async () => {
      // Arrange
      vi.mocked(prisma.invoice.findFirst).mockResolvedValue(null);

      // Act
      const result = await generateInvoiceNumber();

      // Assert
      expect(result).toBe("INV-20260624-0001");
      expect(prisma.invoice.findFirst).toHaveBeenCalledWith({
        where: { invoiceNumber: { startsWith: "INV-20260624-" } },
        orderBy: { invoiceNumber: "desc" },
      });
    });

    it("should increment sequence when last invoice exists", async () => {
      // Arrange
      vi.mocked(prisma.invoice.findFirst).mockResolvedValue({
        invoiceNumber: "INV-20260624-0005",
      } as any);

      // Act
      const result = await generateInvoiceNumber();

      // Assert
      expect(result).toBe("INV-20260624-0006");
    });

    it("should handle large sequence numbers (padded to 4 digits)", async () => {
      // Arrange
      vi.mocked(prisma.invoice.findFirst).mockResolvedValue({
        invoiceNumber: "INV-20260624-0099",
      } as any);

      // Act
      const result = await generateInvoiceNumber();

      // Assert
      expect(result).toBe("INV-20260624-0100");
    });

    it("should fall back to sequence 1 when last invoice number part is non-numeric", async () => {
      // Arrange - parts[2] is non-numeric so parseInt returns NaN
      vi.mocked(prisma.invoice.findFirst).mockResolvedValue({
        invoiceNumber: "INV-20260624-abc",
      } as any);

      // Act
      const result = await generateInvoiceNumber();

      // Assert
      expect(result).toBe("INV-20260624-0001");
    });
  });

  describe("createInvoice", () => {
    const mockSalesOrder = {
      id: "so-1",
      totalAmount: 1000,
      orderNumber: "SO-001",
      customerId: "cust-1",
    };

    const mockInvoice = {
      id: "inv-1",
      invoiceNumber: "INV-20260624-0001",
      salesOrderId: "so-1",
      totalAmount: 1000,
      status: InvoiceStatus.UNPAID,
    };

    it("should create invoice with calculated due date from term of payment days", async () => {
      // Arrange
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(
        mockSalesOrder as any,
      );
      vi.mocked(prisma.invoice.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.invoice.create).mockResolvedValue(mockInvoice as any);

      // Act
      const result = await createInvoice(
        {
          salesOrderId: "so-1",
          invoiceDate: new Date(2026, 5, 24),
          termOfPaymentDays: 30,
        },
        "user-1",
      );

      // Assert
      expect(result).toEqual(mockInvoice);
      expect(prisma.invoice.create).toHaveBeenCalled();
      const createCall = vi.mocked(prisma.invoice.create).mock.calls[0][0];
      expect(createCall.data.status).toBe(InvoiceStatus.UNPAID);
      expect(createCall.data.paidAmount).toBe(0);
      expect(createCall.data.termOfPaymentDays).toBe(30);
    });

    it("should use explicit dueDate when provided", async () => {
      // Arrange
      const explicitDueDate = new Date(2026, 7, 24);
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(
        mockSalesOrder as any,
      );
      vi.mocked(prisma.invoice.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.invoice.create).mockResolvedValue(mockInvoice as any);

      // Act
      await createInvoice(
        {
          salesOrderId: "so-1",
          invoiceDate: new Date(2026, 5, 24),
          dueDate: explicitDueDate,
          termOfPaymentDays: 30,
        },
        "user-1",
      );

      // Assert
      const createCall = vi.mocked(prisma.invoice.create).mock.calls[0][0];
      expect(createCall.data.dueDate).toBe(explicitDueDate);
    });

    it("should default termOfPaymentDays to 0 when not provided", async () => {
      // Arrange
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(
        mockSalesOrder as any,
      );
      vi.mocked(prisma.invoice.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.invoice.create).mockResolvedValue(mockInvoice as any);

      // Act
      await createInvoice(
        {
          salesOrderId: "so-1",
          invoiceDate: new Date(2026, 5, 24),
          termOfPaymentDays: 0,
        },
        "user-1",
      );

      // Assert
      const createCall = vi.mocked(prisma.invoice.create).mock.calls[0][0];
      expect(createCall.data.termOfPaymentDays).toBe(0);
    });

    it("should log activity after invoice creation", async () => {
      // Arrange
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(
        mockSalesOrder as any,
      );
      vi.mocked(prisma.invoice.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.invoice.create).mockResolvedValue(mockInvoice as any);

      // Act
      await createInvoice(
        {
          salesOrderId: "so-1",
          invoiceDate: new Date(2026, 5, 24),
          termOfPaymentDays: 30,
        },
        "user-1",
      );

      // Assert
      expect(logActivity).toHaveBeenCalledWith({
        userId: "user-1",
        action: "CREATE_INVOICE",
        entityType: "Invoice",
        entityId: "inv-1",
        details: "Invoice INV-20260624-0001 created for Order SO-001",
      });
    });

    it("should call AutoJournalService after invoice creation", async () => {
      // Arrange
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(
        mockSalesOrder as any,
      );
      vi.mocked(prisma.invoice.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.invoice.create).mockResolvedValue(mockInvoice as any);

      // Act
      await createInvoice(
        {
          salesOrderId: "so-1",
          invoiceDate: new Date(2026, 5, 24),
          termOfPaymentDays: 30,
        },
        "user-1",
      );

      // Assert
      expect(AutoJournalService.handleSalesInvoiceCreated).toHaveBeenCalledWith(
        "inv-1",
      );
    });

    it("should log error when AutoJournalService fails without throwing", async () => {
      // Arrange
      const journalError = new Error("Journal failed");
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(
        mockSalesOrder as any,
      );
      vi.mocked(prisma.invoice.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.invoice.create).mockResolvedValue(mockInvoice as any);
      vi.mocked(
        AutoJournalService.handleSalesInvoiceCreated,
      ).mockRejectedValueOnce(journalError);

      // Act
      const result = await createInvoice(
        {
          salesOrderId: "so-1",
          invoiceDate: new Date(2026, 5, 24),
          termOfPaymentDays: 30,
        },
        "user-1",
      );

      // Assert - should not throw
      expect(result).toEqual(mockInvoice);
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to generate auto-journal for invoice",
        expect.objectContaining({
          error: journalError,
          invoiceId: "inv-1",
          module: "FinanceInvoiceService",
        }),
      );
    });

    it("should throw error when sales order not found", async () => {
      // Arrange
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(null);

      // Act & Assert
      await expect(
        createInvoice(
          {
            salesOrderId: "so-999",
            invoiceDate: new Date(),
            termOfPaymentDays: 0,
          },
          "user-1",
        ),
      ).rejects.toThrow("Sales Order");
    });

    it("should throw error when sales order has no total amount", async () => {
      // Arrange
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
        id: "so-1",
        totalAmount: null,
        orderNumber: "SO-001",
        customerId: "cust-1",
      } as any);

      // Act & Assert
      await expect(
        createInvoice(
          {
            salesOrderId: "so-1",
            invoiceDate: new Date(),
            termOfPaymentDays: 0,
          },
          "user-1",
        ),
      ).rejects.toThrow("Sales Order has no total amount");
    });

    it("should throw error when sales order has no customer", async () => {
      // Arrange
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
        id: "so-1",
        totalAmount: 1000,
        orderNumber: "SO-001",
        customerId: null,
      } as any);

      // Act & Assert
      await expect(
        createInvoice(
          {
            salesOrderId: "so-1",
            invoiceDate: new Date(),
            termOfPaymentDays: 0,
          },
          "user-1",
        ),
      ).rejects.toThrow(
        "Cannot create invoice for a Sales Order without customer",
      );
    });
  });

  describe("updateInvoiceStatus", () => {
    const mockInvoice = {
      id: "inv-1",
      invoiceNumber: "INV-001",
      status: InvoiceStatus.UNPAID,
    };

    it("should update invoice status to PAID with paidAmount", async () => {
      // Arrange
      vi.mocked(prisma.invoice.findUnique).mockResolvedValue(
        mockInvoice as any,
      );
      vi.mocked(prisma.invoice.update).mockResolvedValue({} as any);
      vi.mocked(prisma.journalEntry.updateMany).mockResolvedValue({ count: 1 });

      // Act
      await updateInvoiceStatus(
        {
          id: "inv-1",
          status: InvoiceStatus.PAID,
          paidAmount: 1000,
        },
        "user-1",
      );

      // Assert
      expect(prisma.invoice.update).toHaveBeenCalledWith({
        where: { id: "inv-1" },
        data: { status: InvoiceStatus.PAID, paidAmount: 1000 },
      });
    });

    it("should omit paidAmount when not provided", async () => {
      // Arrange
      vi.mocked(prisma.invoice.findUnique).mockResolvedValue(
        mockInvoice as any,
      );
      vi.mocked(prisma.invoice.update).mockResolvedValue({} as any);
      vi.mocked(prisma.journalEntry.updateMany).mockResolvedValue({ count: 1 });

      // Act
      await updateInvoiceStatus(
        {
          id: "inv-1",
          status: InvoiceStatus.PAID,
        },
        "user-1",
      );

      // Assert
      const updateCall = vi.mocked(prisma.invoice.update).mock.calls[0][0];
      expect(updateCall.data).not.toHaveProperty("paidAmount");
    });

    it("should set journal to POSTED for UNPAID status", async () => {
      // Arrange
      vi.mocked(prisma.invoice.findUnique).mockResolvedValue(
        mockInvoice as any,
      );
      vi.mocked(prisma.invoice.update).mockResolvedValue({} as any);
      vi.mocked(prisma.journalEntry.updateMany).mockResolvedValue({ count: 1 });

      // Act
      await updateInvoiceStatus(
        {
          id: "inv-1",
          status: InvoiceStatus.UNPAID,
        },
        "user-1",
      );

      // Assert
      expect(prisma.journalEntry.updateMany).toHaveBeenCalledWith({
        where: { referenceId: "inv-1", referenceType: "SALES_INVOICE" },
        data: { status: JournalStatus.POSTED },
      });
    });

    it("should set journal to POSTED for PARTIAL status", async () => {
      // Arrange
      vi.mocked(prisma.invoice.findUnique).mockResolvedValue(
        mockInvoice as any,
      );
      vi.mocked(prisma.invoice.update).mockResolvedValue({} as any);
      vi.mocked(prisma.journalEntry.updateMany).mockResolvedValue({ count: 1 });

      // Act
      await updateInvoiceStatus(
        {
          id: "inv-1",
          status: InvoiceStatus.PARTIAL,
        },
        "user-1",
      );

      // Assert
      expect(prisma.journalEntry.updateMany).toHaveBeenCalledWith({
        where: { referenceId: "inv-1", referenceType: "SALES_INVOICE" },
        data: { status: JournalStatus.POSTED },
      });
    });

    it("should set journal to POSTED for OVERDUE status", async () => {
      // Arrange
      vi.mocked(prisma.invoice.findUnique).mockResolvedValue(
        mockInvoice as any,
      );
      vi.mocked(prisma.invoice.update).mockResolvedValue({} as any);
      vi.mocked(prisma.journalEntry.updateMany).mockResolvedValue({ count: 1 });

      // Act
      await updateInvoiceStatus(
        {
          id: "inv-1",
          status: InvoiceStatus.OVERDUE,
        },
        "user-1",
      );

      // Assert
      expect(prisma.journalEntry.updateMany).toHaveBeenCalledWith({
        where: { referenceId: "inv-1", referenceType: "SALES_INVOICE" },
        data: { status: JournalStatus.POSTED },
      });
    });

    it("should set journal to VOIDED for CANCELLED status", async () => {
      // Arrange
      vi.mocked(prisma.invoice.findUnique).mockResolvedValue(
        mockInvoice as any,
      );
      vi.mocked(prisma.invoice.update).mockResolvedValue({} as any);
      vi.mocked(prisma.journalEntry.updateMany).mockResolvedValue({ count: 1 });

      // Act
      await updateInvoiceStatus(
        {
          id: "inv-1",
          status: InvoiceStatus.CANCELLED,
        },
        "user-1",
      );

      // Assert
      expect(prisma.journalEntry.updateMany).toHaveBeenCalledWith({
        where: { referenceId: "inv-1", referenceType: "SALES_INVOICE" },
        data: { status: JournalStatus.VOIDED },
      });
    });

    it("should set journal to DRAFT for DRAFT status", async () => {
      // Arrange
      vi.mocked(prisma.invoice.findUnique).mockResolvedValue(
        mockInvoice as any,
      );
      vi.mocked(prisma.invoice.update).mockResolvedValue({} as any);
      vi.mocked(prisma.journalEntry.updateMany).mockResolvedValue({ count: 1 });

      // Act
      await updateInvoiceStatus(
        {
          id: "inv-1",
          status: InvoiceStatus.DRAFT,
        },
        "user-1",
      );

      // Assert
      expect(prisma.journalEntry.updateMany).toHaveBeenCalledWith({
        where: { referenceId: "inv-1", referenceType: "SALES_INVOICE" },
        data: { status: JournalStatus.DRAFT },
      });
    });

    it("should log activity after status update", async () => {
      // Arrange
      vi.mocked(prisma.invoice.findUnique).mockResolvedValue(
        mockInvoice as any,
      );
      vi.mocked(prisma.invoice.update).mockResolvedValue({} as any);
      vi.mocked(prisma.journalEntry.updateMany).mockResolvedValue({ count: 1 });

      // Act
      await updateInvoiceStatus(
        {
          id: "inv-1",
          status: InvoiceStatus.PAID,
        },
        "user-1",
      );

      // Assert
      expect(logActivity).toHaveBeenCalledWith({
        userId: "user-1",
        action: "UPDATE_INVOICE",
        entityType: "Invoice",
        entityId: "inv-1",
        details: "Invoice INV-001 status updated to PAID",
      });
    });

    it("should throw error when invoice not found", async () => {
      // Arrange
      vi.mocked(prisma.invoice.findUnique).mockResolvedValue(null);

      // Act & Assert
      await expect(
        updateInvoiceStatus(
          {
            id: "inv-999",
            status: InvoiceStatus.PAID,
          },
          "user-1",
        ),
      ).rejects.toThrow("Invoice");
    });
  });

  describe("createDraftInvoiceFromOrder", () => {
    const mockSalesOrder = {
      id: "so-1",
      totalAmount: 1000,
      orderNumber: "SO-001",
      customerId: "cust-1",
    };

    const mockInvoice = {
      id: "inv-1",
      invoiceNumber: "INV-20260624-0001",
      status: InvoiceStatus.DRAFT,
    };

    it("should create draft invoice from sales order", async () => {
      // Arrange
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(
        mockSalesOrder as any,
      );
      vi.mocked(prisma.invoice.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.invoice.create).mockResolvedValue(mockInvoice as any);

      // Act
      const result = await createDraftInvoiceFromOrder("so-1", "user-1");

      // Assert
      expect(result).toEqual(mockInvoice);
      expect(prisma.invoice.create).toHaveBeenCalled();
      const createCall = vi.mocked(prisma.invoice.create).mock.calls[0][0];
      expect(createCall.data.status).toBe(InvoiceStatus.DRAFT);
      expect(createCall.data.paidAmount).toBe(0);
      expect(createCall.data.termOfPaymentDays).toBe(30);
      expect(createCall.data.notes).toBe(
        "System generated draft invoice for Order SO-001",
      );
    });

    it("should log activity after creating draft invoice", async () => {
      // Arrange
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(
        mockSalesOrder as any,
      );
      vi.mocked(prisma.invoice.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.invoice.create).mockResolvedValue(mockInvoice as any);

      // Act
      await createDraftInvoiceFromOrder("so-1", "user-1");

      // Assert
      expect(logActivity).toHaveBeenCalledWith({
        userId: "user-1",
        action: "AUTO_GENERATE_INVOICE",
        entityType: "Invoice",
        entityId: "inv-1",
        details:
          "Automated draft invoice INV-20260624-0001 generated for shipped Order SO-001",
      });
    });

    it("should call AutoJournalService after draft invoice creation", async () => {
      // Arrange
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(
        mockSalesOrder as any,
      );
      vi.mocked(prisma.invoice.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.invoice.create).mockResolvedValue(mockInvoice as any);

      // Act
      await createDraftInvoiceFromOrder("so-1", "user-1");

      // Assert
      expect(AutoJournalService.handleSalesInvoiceCreated).toHaveBeenCalledWith(
        "inv-1",
      );
    });

    it("should log error when AutoJournalService fails without throwing", async () => {
      // Arrange
      const journalError = new Error("Journal failed");
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(
        mockSalesOrder as any,
      );
      vi.mocked(prisma.invoice.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.invoice.create).mockResolvedValue(mockInvoice as any);
      vi.mocked(
        AutoJournalService.handleSalesInvoiceCreated,
      ).mockRejectedValueOnce(journalError);

      // Act
      const result = await createDraftInvoiceFromOrder("so-1", "user-1");

      // Assert - should not throw
      expect(result).toEqual(mockInvoice);
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to generate auto-journal for invoice",
        expect.objectContaining({
          error: journalError,
          invoiceId: "inv-1",
          module: "FinanceInvoiceService",
        }),
      );
    });

    it("should return undefined when sales order not found", async () => {
      // Arrange
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(null);

      // Act
      const result = await createDraftInvoiceFromOrder("so-999", "user-1");

      // Assert
      expect(result).toBeUndefined();
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });

    it("should return undefined when sales order has no total amount", async () => {
      // Arrange
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
        ...mockSalesOrder,
        totalAmount: null,
      } as any);

      // Act
      const result = await createDraftInvoiceFromOrder("so-1", "user-1");

      // Assert
      expect(result).toBeUndefined();
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });

    it("should return undefined when sales order has no customer", async () => {
      // Arrange
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
        ...mockSalesOrder,
        customerId: null,
      } as any);

      // Act
      const result = await createDraftInvoiceFromOrder("so-1", "user-1");

      // Assert
      expect(result).toBeUndefined();
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });

    it("should return undefined when invoice already exists for the sales order", async () => {
      // Arrange
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(
        mockSalesOrder as any,
      );
      vi.mocked(prisma.invoice.findFirst).mockResolvedValue({
        id: "inv-existing",
      } as any);

      // Act
      const result = await createDraftInvoiceFromOrder("so-1", "user-1");

      // Assert
      expect(result).toBeUndefined();
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });

    it("should calculate due date as 30 days from now", async () => {
      // Arrange
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(
        mockSalesOrder as any,
      );
      vi.mocked(prisma.invoice.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.invoice.create).mockResolvedValue(mockInvoice as any);

      // Act
      await createDraftInvoiceFromOrder("so-1", "user-1");

      // Assert
      const createCall = vi.mocked(prisma.invoice.create).mock.calls[0][0];
      const expectedDueDate = new Date(2026, 5, 24 + 30);
      expect(createCall.data.dueDate).toEqual(expectedDueDate);
    });
  });
});
