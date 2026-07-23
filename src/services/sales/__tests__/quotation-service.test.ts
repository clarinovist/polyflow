import { describe, it, expect, vi, beforeEach } from "vitest";
import { QuotationService } from "../quotation-service";
import { prisma } from "@/lib/core/prisma";
import {
  SalesQuotationStatus,
  SalesOrderStatus,
  SalesOrderType,
} from "@prisma/client";

// Mock prisma
vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    salesQuotation: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    salesQuotationItem: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    salesOrder: {
      create: vi.fn(),
      count: vi.fn(),
    },
    salesOrderItem: {
      createMany: vi.fn(),
    },
    customer: {
      findUnique: vi.fn(),
    },
    productVariant: {
      findUnique: vi.fn(),
    },
    stockReservation: {
      aggregate: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback(prisma)),
  },
}));

// Mock audit
vi.mock("@/lib/tools/audit", () => ({
  logActivity: vi.fn(),
}));

// Mock reservation-service
vi.mock("@/services/inventory/reservation-service", () => ({
  createStockReservation: vi.fn(),
}));

describe("QuotationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ----------------------------------------------------------------
  // generateQuotationNumber
  // ----------------------------------------------------------------
  describe("generateQuotationNumber", () => {
    it("should generate quotation number with sequence 0001", async () => {
      // Arrange
      const year = new Date().getFullYear();
      vi.mocked(prisma.salesQuotation.count).mockResolvedValue(0);

      // Act
      const result = await QuotationService.generateQuotationNumber();

      // Assert
      expect(result).toBe(`SQ-${year}-0001`);
    });

    it("should increment sequence when quotations exist", async () => {
      // Arrange
      const year = new Date().getFullYear();
      vi.mocked(prisma.salesQuotation.count).mockResolvedValue(5);

      // Act
      const result = await QuotationService.generateQuotationNumber();

      // Assert
      expect(result).toBe(`SQ-${year}-0006`);
    });

    it("should pad sequence to four digits", async () => {
      // Arrange
      vi.mocked(prisma.salesQuotation.count).mockResolvedValue(99);

      // Act
      const result = await QuotationService.generateQuotationNumber();

      // Assert
      expect(result).toMatch(/SQ-\d{4}-0100/);
    });
  });

  // ----------------------------------------------------------------
  // getQuotations
  // ----------------------------------------------------------------
  describe("getQuotations", () => {
    it("should return all quotations", async () => {
      // Arrange
      const mockQuotations = [
        {
          id: "sq-1",
          quotationNumber: "SQ-2024-0001",
          customer: { name: "Customer A" },
          _count: { items: 3 },
        },
      ];

      vi.mocked(prisma.salesQuotation.findMany).mockResolvedValue(
        mockQuotations as any,
      );

      // Act
      const result = await QuotationService.getQuotations();

      // Assert
      expect(result).toEqual(mockQuotations);
      expect(prisma.salesQuotation.findMany).toHaveBeenCalledWith({
        where: {},
        include: {
          customer: true,
          _count: {
            select: { items: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });
    });

    it("should filter by date range when both dates provided", async () => {
      // Arrange
      const startDate = new Date(2024, 0, 1);
      const endDate = new Date(2024, 0, 31);

      vi.mocked(prisma.salesQuotation.findMany).mockResolvedValue([]);

      // Act
      await QuotationService.getQuotations({ startDate, endDate });

      // Assert
      expect(prisma.salesQuotation.findMany).toHaveBeenCalledWith({
        where: {
          quotationDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        include: expect.any(Object),
        orderBy: { createdAt: "desc" },
      });
    });

    it("should not filter when only startDate is provided", async () => {
      // Arrange
      vi.mocked(prisma.salesQuotation.findMany).mockResolvedValue([]);

      // Act
      await QuotationService.getQuotations({ startDate: new Date(2024, 0, 1) });

      // Assert
      expect(prisma.salesQuotation.findMany).toHaveBeenCalledWith({
        where: {},
        include: expect.any(Object),
        orderBy: { createdAt: "desc" },
      });
    });

    it("should not filter when only endDate is provided", async () => {
      // Arrange
      vi.mocked(prisma.salesQuotation.findMany).mockResolvedValue([]);

      // Act
      await QuotationService.getQuotations({ endDate: new Date(2024, 0, 31) });

      // Assert
      expect(prisma.salesQuotation.findMany).toHaveBeenCalledWith({
        where: {},
        include: expect.any(Object),
        orderBy: { createdAt: "desc" },
      });
    });

    it("should return empty array when no quotations exist", async () => {
      // Arrange
      vi.mocked(prisma.salesQuotation.findMany).mockResolvedValue([]);

      // Act
      const result = await QuotationService.getQuotations();

      // Assert
      expect(result).toEqual([]);
    });
  });

  // ----------------------------------------------------------------
  // getQuotationById
  // ----------------------------------------------------------------
  describe("getQuotationById", () => {
    it("should return quotation by id", async () => {
      // Arrange
      const mockQuotation = {
        id: "sq-1",
        quotationNumber: "SQ-2024-0001",
        customer: { name: "Customer A" },
        items: [
          {
            productVariant: {
              name: "Product A",
              product: { name: "Product A" },
            },
          },
        ],
        createdBy: { name: "John" },
        salesOrders: [],
      };

      vi.mocked(prisma.salesQuotation.findUnique).mockResolvedValue(
        mockQuotation as any,
      );

      // Act
      const result = await QuotationService.getQuotationById("sq-1");

      // Assert
      expect(result).toEqual(mockQuotation);
      expect(prisma.salesQuotation.findUnique).toHaveBeenCalledWith({
        where: { id: "sq-1" },
        include: {
          customer: true,
          items: {
            include: {
              productVariant: {
                include: {
                  product: true,
                },
              },
            },
          },
          createdBy: true,
          salesOrders: true,
        },
      });
    });

    it("should return null when quotation not found", async () => {
      // Arrange
      vi.mocked(prisma.salesQuotation.findUnique).mockResolvedValue(null);

      // Act
      const result = await QuotationService.getQuotationById("sq-999");

      // Assert
      expect(result).toBeNull();
    });
  });

  // ----------------------------------------------------------------
  // deleteQuotation
  // ----------------------------------------------------------------
  describe("deleteQuotation", () => {
    it("should delete quotation", async () => {
      // Arrange
      vi.mocked(prisma.salesQuotation.findUnique).mockResolvedValue({
        id: "sq-1",
        status: "DRAFT",
      } as any);

      vi.mocked(prisma.salesQuotation.delete).mockResolvedValue({} as any);

      // Act
      await QuotationService.deleteQuotation("sq-1");

      // Assert
      expect(prisma.salesQuotation.delete).toHaveBeenCalledWith({
        where: { id: "sq-1" },
      });
    });

    it("should delete quotation with SENT status", async () => {
      // Arrange
      vi.mocked(prisma.salesQuotation.findUnique).mockResolvedValue({
        id: "sq-1",
        status: "SENT",
      } as any);
      vi.mocked(prisma.salesQuotation.delete).mockResolvedValue({} as any);

      // Act
      await QuotationService.deleteQuotation("sq-1");

      // Assert
      expect(prisma.salesQuotation.delete).toHaveBeenCalledWith({
        where: { id: "sq-1" },
      });
    });

    it("should throw error when quotation not found", async () => {
      // Arrange
      vi.mocked(prisma.salesQuotation.findUnique).mockResolvedValue(null);

      // Act & Assert
      await expect(QuotationService.deleteQuotation("sq-999")).rejects.toThrow(
        "Sales Quotation",
      );
    });

    it("should throw error when quotation is converted", async () => {
      // Arrange
      vi.mocked(prisma.salesQuotation.findUnique).mockResolvedValue({
        id: "sq-1",
        status: "CONVERTED",
      } as any);

      // Act & Assert
      await expect(QuotationService.deleteQuotation("sq-1")).rejects.toThrow(
        "Cannot delete converted quotation",
      );
    });

    it("should allow deleting EXPIRED quotation", async () => {
      // Arrange
      vi.mocked(prisma.salesQuotation.findUnique).mockResolvedValue({
        id: "sq-1",
        status: "EXPIRED",
      } as any);
      vi.mocked(prisma.salesQuotation.delete).mockResolvedValue({} as any);

      // Act
      await QuotationService.deleteQuotation("sq-1");

      // Assert
      expect(prisma.salesQuotation.delete).toHaveBeenCalledWith({
        where: { id: "sq-1" },
      });
    });
  });

  // ----------------------------------------------------------------
  // updateQuotation
  // ----------------------------------------------------------------
  describe("updateQuotation", () => {
    it("should throw error when quotation not found", async () => {
      // Arrange
      vi.mocked(prisma.salesQuotation.findUnique).mockResolvedValue(null);

      // Act & Assert
      await expect(
        QuotationService.updateQuotation({
          id: "sq-999",
          customerId: "cust-1",
          quotationDate: new Date(),
          validUntil: new Date(),
          items: [],
        }),
      ).rejects.toThrow("Sales Quotation");
    });

    it("should throw error when quotation is converted", async () => {
      // Arrange
      vi.mocked(prisma.salesQuotation.findUnique).mockResolvedValue({
        id: "sq-1",
        status: "CONVERTED",
      } as any);

      // Act & Assert
      await expect(
        QuotationService.updateQuotation({
          id: "sq-1",
          customerId: "cust-1",
          quotationDate: new Date(),
          validUntil: new Date(),
          items: [],
        }),
      ).rejects.toThrow("Cannot update quotation in CONVERTED status");
    });

    it("should throw error when quotation is expired", async () => {
      // Arrange
      vi.mocked(prisma.salesQuotation.findUnique).mockResolvedValue({
        id: "sq-1",
        status: "EXPIRED",
      } as any);

      // Act & Assert
      await expect(
        QuotationService.updateQuotation({
          id: "sq-1",
          customerId: "cust-1",
          quotationDate: new Date(),
          validUntil: new Date(),
          items: [],
        }),
      ).rejects.toThrow("Cannot update quotation in EXPIRED status");
    });

    it("should update quotation with items successfully", async () => {
      // Arrange
      vi.mocked(prisma.salesQuotation.findUnique).mockResolvedValue({
        id: "sq-1",
        status: "DRAFT",
      } as any);

      vi.mocked(prisma.productVariant.findUnique).mockResolvedValue({
        id: "pv-1",
        primaryUnit: "kg",
        salesUnit: null,
        conversionFactor: null,
      } as any);

      const mockUpdated = {
        id: "sq-1",
        quotationNumber: "SQ-2024-0001",
        totalAmount: 500,
        items: [
          {
            productVariantId: "pv-1",
            quantity: 5,
            unitPrice: 100,
              discountPercent: 0,
              taxPercent: 0,
            subtotal: 500,
          },
        ],
      };

      vi.mocked(prisma.salesQuotationItem.deleteMany).mockResolvedValue({
        count: 1,
      });
      vi.mocked(prisma.salesQuotation.update).mockResolvedValue(
        mockUpdated as any,
      );

      // Act
      const result = await QuotationService.updateQuotation({
        id: "sq-1",
        customerId: "cust-1",
        quotationDate: new Date(),
        validUntil: new Date(),
        items: [
          {
            productVariantId: "pv-1",
            quantity: 5,
            unitPrice: 100,
            discountPercent: 0,
            taxPercent: 0,
          },
        ],
      });

      // Assert
      expect(result).toEqual(mockUpdated);
      expect(prisma.salesQuotationItem.deleteMany).toHaveBeenCalledWith({
        where: { salesQuotationId: "sq-1" },
      });
      expect(prisma.salesQuotation.update).toHaveBeenCalled();
    });

    it("should calculate totals with discount and tax", async () => {
      // Arrange
      vi.mocked(prisma.salesQuotation.findUnique).mockResolvedValue({
        id: "sq-1",
        status: "DRAFT",
      } as any);

      vi.mocked(prisma.productVariant.findUnique).mockResolvedValue({
        id: "pv-1",
        primaryUnit: "kg",
        salesUnit: null,
        conversionFactor: null,
      } as any);

      vi.mocked(prisma.salesQuotationItem.deleteMany).mockResolvedValue({
        count: 1,
      });
      vi.mocked(prisma.salesQuotation.update).mockResolvedValue({
        id: "sq-1",
      } as any);

      // Act
      await QuotationService.updateQuotation({
        id: "sq-1",
        customerId: "cust-1",
        quotationDate: new Date(),
        validUntil: new Date(),
        items: [
          {
            productVariantId: "pv-1",
            quantity: 10,
            unitPrice: 100,
            discountPercent: 10,
            taxPercent: 11,
          },
        ],
      });

      // Assert
      expect(prisma.salesQuotation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalAmount: expect.closeTo(999, 1),
            discountAmount: expect.closeTo(100, 1),
            taxAmount: expect.closeTo(99, 1),
          }),
        }),
      );
    });

    it("should throw error when product variant not found during update", async () => {
      // Arrange
      vi.mocked(prisma.salesQuotation.findUnique).mockResolvedValue({
        id: "sq-1",
        status: "DRAFT",
      } as any);

      vi.mocked(prisma.productVariant.findUnique).mockResolvedValue(null);

      // Act & Assert
      await expect(
        QuotationService.updateQuotation({
          id: "sq-1",
          customerId: "cust-1",
          quotationDate: new Date(),
          validUntil: new Date(),
          items: [
            {
              productVariantId: "pv-999",
              quantity: 1,
              unitPrice: 100,
              discountPercent: 0,
              taxPercent: 0,
            },
          ],
        }),
      ).rejects.toThrow("Product Variant 'pv-999' tidak ditemukan");
    });

    it("should allow updating status manually during update", async () => {
      // Arrange
      vi.mocked(prisma.salesQuotation.findUnique).mockResolvedValue({
        id: "sq-1",
        status: "DRAFT",
      } as any);

      vi.mocked(prisma.productVariant.findUnique).mockResolvedValue({
        id: "pv-1",
        primaryUnit: "kg",
        salesUnit: null,
        conversionFactor: null,
      } as any);

      vi.mocked(prisma.salesQuotationItem.deleteMany).mockResolvedValue({
        count: 0,
      });
      vi.mocked(prisma.salesQuotation.update).mockResolvedValue({
        id: "sq-1",
      } as any);

      // Act
      await QuotationService.updateQuotation({
        id: "sq-1",
        customerId: "cust-1",
        quotationDate: new Date(),
        validUntil: new Date(),
        status: SalesQuotationStatus.SENT,
        items: [
          {
            productVariantId: "pv-1",
            quantity: 1,
            unitPrice: 50,
            discountPercent: 0,
            taxPercent: 0,
          },
        ],
      });

      // Assert
      expect(prisma.salesQuotation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: SalesQuotationStatus.SENT,
          }),
        }),
      );
    });

    it("should update with multiple items", async () => {
      // Arrange
      vi.mocked(prisma.salesQuotation.findUnique).mockResolvedValue({
        id: "sq-1",
        status: "DRAFT",
      } as any);

      vi.mocked(prisma.productVariant.findUnique).mockResolvedValue({
        id: "pv-1",
        primaryUnit: "kg",
        salesUnit: null,
        conversionFactor: null,
      } as any);

      vi.mocked(prisma.salesQuotationItem.deleteMany).mockResolvedValue({
        count: 2,
      });
      vi.mocked(prisma.salesQuotation.update).mockResolvedValue({
        id: "sq-1",
      } as any);

      // Act
      await QuotationService.updateQuotation({
        id: "sq-1",
        customerId: "cust-1",
        quotationDate: new Date(),
        validUntil: new Date(),
        notes: "Updated notes",
        items: [
          {
            productVariantId: "pv-1",
            quantity: 5,
            unitPrice: 100,
            discountPercent: 0,
            taxPercent: 0,
          },
          {
            productVariantId: "pv-1",
            quantity: 3,
            unitPrice: 200,
            discountPercent: 0,
            taxPercent: 0,
          },
        ],
      });

      // Assert
      expect(prisma.salesQuotationItem.deleteMany).toHaveBeenCalledWith({
        where: { salesQuotationId: "sq-1" },
      });
      expect(prisma.salesQuotation.update).toHaveBeenCalled();
    });
  });

  // ----------------------------------------------------------------
  // createQuotation
  // ----------------------------------------------------------------
  describe("createQuotation", () => {
    it("should create quotation with items", async () => {
      // Arrange
      const year = new Date().getFullYear();
      const mockCustomer = {
        id: "cust-1",
        name: "Customer A",
      };

      const mockVariant = {
        id: "pv-1",
        primaryUnit: "kg",
        salesUnit: null,
        conversionFactor: null,
      };

      const mockQuotation = {
        id: "sq-1",
        quotationNumber: `SQ-${year}-0001`,
        customerId: "cust-1",
        totalAmount: 1000,
        status: "DRAFT",
        items: [
          {
            productVariantId: "pv-1",
            quantity: 10,
            unitPrice: 100,
              discountPercent: 0,
              taxPercent: 0,
            subtotal: 1000,
          },
        ],
      };

      vi.mocked(prisma.customer.findUnique).mockResolvedValue(
        mockCustomer as any,
      );
      vi.mocked(prisma.salesQuotation.count).mockResolvedValue(0);
      vi.mocked(prisma.productVariant.findUnique).mockResolvedValue(
        mockVariant as any,
      );
      vi.mocked(prisma.salesQuotation.create).mockResolvedValue(
        mockQuotation as any,
      );

      // Act
      const result = await QuotationService.createQuotation(
        {
          customerId: "cust-1",
          quotationDate: new Date(),
          validUntil: new Date(),
          items: [
            {
              productVariantId: "pv-1",
              quantity: 10,
              unitPrice: 100,
              discountPercent: 0,
              taxPercent: 0,
            },
          ],
        },
        "user-1",
      );

      // Assert
      expect(result).toEqual(mockQuotation);
      expect(prisma.salesQuotation.create).toHaveBeenCalled();
    });

    it("should throw error when customer not found", async () => {
      // Arrange
      vi.mocked(prisma.customer.findUnique).mockResolvedValue(null);

      // Act & Assert
      await expect(
        QuotationService.createQuotation(
          {
            customerId: "cust-999",
            quotationDate: new Date(),
            validUntil: new Date(),
            items: [],
          },
          "user-1",
        ),
      ).rejects.toThrow("Customer 'cust-999' tidak ditemukan");
    });

    it("should throw error when product variant not found", async () => {
      // Arrange
      vi.mocked(prisma.customer.findUnique).mockResolvedValue({
        id: "cust-1",
      } as any);
      vi.mocked(prisma.salesQuotation.count).mockResolvedValue(0);
      vi.mocked(prisma.productVariant.findUnique).mockResolvedValue(null);

      // Act & Assert
      await expect(
        QuotationService.createQuotation(
          {
            customerId: "cust-1",
            quotationDate: new Date(),
            validUntil: new Date(),
            items: [
              {
                productVariantId: "pv-999",
                quantity: 1,
                unitPrice: 100,
                discountPercent: 0,
                taxPercent: 0,
              },
            ],
          },
          "user-1",
        ),
      ).rejects.toThrow("Product Variant 'pv-999' tidak ditemukan");
    });

    it("should calculate totals with discount and tax", async () => {
      // Arrange
      vi.mocked(prisma.customer.findUnique).mockResolvedValue({
        id: "cust-1",
      } as any);
      vi.mocked(prisma.salesQuotation.count).mockResolvedValue(0);
      vi.mocked(prisma.productVariant.findUnique).mockResolvedValue({
        id: "pv-1",
        primaryUnit: "kg",
        salesUnit: null,
        conversionFactor: null,
      } as any);
      vi.mocked(prisma.salesQuotation.create).mockResolvedValue({
        id: "sq-1",
      } as any);

      // Act
      await QuotationService.createQuotation(
        {
          customerId: "cust-1",
          quotationDate: new Date(),
          validUntil: new Date(),
          items: [
            {
              productVariantId: "pv-1",
              quantity: 10,
              unitPrice: 100,
              discountPercent: 10,
              taxPercent: 11,
            },
          ],
        },
        "user-1",
      );

      // Assert - 10 * 100 = 1000, 10% discount = 100, after discount = 900, 11% tax = 99, total = 999
      expect(prisma.salesQuotation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalAmount: expect.closeTo(999, 1),
            discountAmount: expect.closeTo(100, 1),
            taxAmount: expect.closeTo(99, 1),
          }),
        }),
      );
    });

    it("should create quotation with notes", async () => {
      // Arrange
      vi.mocked(prisma.customer.findUnique).mockResolvedValue({
        id: "cust-1",
      } as any);
      vi.mocked(prisma.salesQuotation.count).mockResolvedValue(0);
      vi.mocked(prisma.productVariant.findUnique).mockResolvedValue({
        id: "pv-1",
        primaryUnit: "kg",
        salesUnit: null,
        conversionFactor: null,
      } as any);
      vi.mocked(prisma.salesQuotation.create).mockResolvedValue({
        id: "sq-1",
      } as any);

      // Act
      await QuotationService.createQuotation(
        {
          customerId: "cust-1",
          quotationDate: new Date(),
          validUntil: new Date(),
          notes: "Please deliver soon",
          items: [
            {
              productVariantId: "pv-1",
              quantity: 5,
              unitPrice: 200,
              discountPercent: 0,
              taxPercent: 0,
            },
          ],
        },
        "user-1",
      );

      // Assert
      expect(prisma.salesQuotation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            notes: "Please deliver soon",
          }),
        }),
      );
    });

    it("should create quotation with conversion payload using primary unit", async () => {
      // Arrange
      vi.mocked(prisma.customer.findUnique).mockResolvedValue({
        id: "cust-1",
      } as any);
      vi.mocked(prisma.salesQuotation.count).mockResolvedValue(0);
      vi.mocked(prisma.productVariant.findUnique).mockResolvedValue({
        id: "pv-1",
        primaryUnit: "kg",
        salesUnit: null,
        conversionFactor: null,
      } as any);
      vi.mocked(prisma.salesQuotation.create).mockResolvedValue({
        id: "sq-1",
      } as any);

      // Act - enteredUnit matches primaryUnit, factor = 1
      await QuotationService.createQuotation(
        {
          customerId: "cust-1",
          quotationDate: new Date(),
          validUntil: new Date(),
          items: [
            {
              productVariantId: "pv-1",
              quantity: 10,
              unitPrice: 100,
              discountPercent: 0,
              taxPercent: 0,
              enteredQuantity: 10,
              enteredUnit: "kg" as any,
              enteredUnitPrice: 100,
              conversionFactorSnapshot: 1,
            },
          ],
        },
        "user-1",
      );

      // Assert
      expect(prisma.salesQuotation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalAmount: expect.closeTo(1000, 1),
          }),
        }),
      );
    });

    it("should create quotation with conversion payload using sales unit", async () => {
      // Arrange
      vi.mocked(prisma.customer.findUnique).mockResolvedValue({
        id: "cust-1",
      } as any);
      vi.mocked(prisma.salesQuotation.count).mockResolvedValue(0);
      vi.mocked(prisma.productVariant.findUnique).mockResolvedValue({
        id: "pv-1",
        primaryUnit: "kg",
        salesUnit: "box",
        conversionFactor: 10,
      } as any);
      vi.mocked(prisma.salesQuotation.create).mockResolvedValue({
        id: "sq-1",
      } as any);

      // Act - enteredUnit = 'box' (salesUnit), conversionFactor = 10
      // baseQuantity = 2 * 10 = 20, baseUnitPrice = 1000 / 10 = 100
      await QuotationService.createQuotation(
        {
          customerId: "cust-1",
          quotationDate: new Date(),
          validUntil: new Date(),
          items: [
            {
              productVariantId: "pv-1",
              quantity: 20,
              unitPrice: 100,
              discountPercent: 0,
              taxPercent: 0,
              enteredQuantity: 2,
              enteredUnit: "box" as any,
              enteredUnitPrice: 1000,
              conversionFactorSnapshot: 10,
            },
          ],
        },
        "user-1",
      );

      // Assert
      expect(prisma.salesQuotation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            items: expect.objectContaining({
              create: expect.arrayContaining([
                expect.objectContaining({
                  quantity: 20,
                  unitPrice: 100,
                }),
              ]),
            }),
          }),
        }),
      );
    });

    it("should throw error for incomplete conversion payload", async () => {
      // Arrange
      vi.mocked(prisma.customer.findUnique).mockResolvedValue({
        id: "cust-1",
      } as any);
      vi.mocked(prisma.salesQuotation.count).mockResolvedValue(0);
      vi.mocked(prisma.productVariant.findUnique).mockResolvedValue({
        id: "pv-1",
        primaryUnit: "kg",
        salesUnit: "box",
        conversionFactor: 10,
      } as any);

      // Act & Assert - only some conversion fields provided (1 of 4)
      await expect(
        QuotationService.createQuotation(
          {
            customerId: "cust-1",
            quotationDate: new Date(),
            validUntil: new Date(),
            items: [
              {
                productVariantId: "pv-1",
                quantity: 10,
                unitPrice: 100,
              discountPercent: 0,
              taxPercent: 0,
                enteredQuantity: 1,
              },
            ],
          },
          "user-1",
        ),
      ).rejects.toThrow("Incomplete quotation conversion payload");
    });

    it("should throw error for partially incomplete conversion payload", async () => {
      // Arrange
      vi.mocked(prisma.customer.findUnique).mockResolvedValue({
        id: "cust-1",
      } as any);
      vi.mocked(prisma.salesQuotation.count).mockResolvedValue(0);
      vi.mocked(prisma.productVariant.findUnique).mockResolvedValue({
        id: "pv-1",
        primaryUnit: "kg",
        salesUnit: "box",
        conversionFactor: 10,
      } as any);

      // Act & Assert - 3 of 4 conversion fields provided
      await expect(
        QuotationService.createQuotation(
          {
            customerId: "cust-1",
            quotationDate: new Date(),
            validUntil: new Date(),
            items: [
              {
                productVariantId: "pv-1",
                quantity: 10,
                unitPrice: 100,
              discountPercent: 0,
              taxPercent: 0,
                enteredQuantity: 1,
                enteredUnit: "box" as any,
                enteredUnitPrice: 100,
              },
            ],
          },
          "user-1",
        ),
      ).rejects.toThrow("Incomplete quotation conversion payload");
    });

    it("should throw error for invalid conversion unit", async () => {
      // Arrange
      vi.mocked(prisma.customer.findUnique).mockResolvedValue({
        id: "cust-1",
      } as any);
      vi.mocked(prisma.salesQuotation.count).mockResolvedValue(0);
      vi.mocked(prisma.productVariant.findUnique).mockResolvedValue({
        id: "pv-1",
        primaryUnit: "kg",
        salesUnit: "box",
        conversionFactor: 10,
      } as any);

      // Act & Assert - enteredUnit is neither primaryUnit nor salesUnit
      await expect(
        QuotationService.createQuotation(
          {
            customerId: "cust-1",
            quotationDate: new Date(),
            validUntil: new Date(),
            items: [
              {
                productVariantId: "pv-1",
                quantity: 10,
                unitPrice: 100,
              discountPercent: 0,
              taxPercent: 0,
                enteredQuantity: 1,
                enteredUnit: "piece" as any,
                enteredUnitPrice: 100,
                conversionFactorSnapshot: 10,
              },
            ],
          },
          "user-1",
        ),
      ).rejects.toThrow("Unit piece is not valid for this product variant");
    });

    it("should throw error when sales unit is null and entered unit differs from primary", async () => {
      // Arrange
      vi.mocked(prisma.customer.findUnique).mockResolvedValue({
        id: "cust-1",
      } as any);
      vi.mocked(prisma.salesQuotation.count).mockResolvedValue(0);
      vi.mocked(prisma.productVariant.findUnique).mockResolvedValue({
        id: "pv-1",
        primaryUnit: "kg",
        salesUnit: null,
        conversionFactor: null,
      } as any);

      // Act & Assert - enteredUnit != primaryUnit, salesUnit is null
      await expect(
        QuotationService.createQuotation(
          {
            customerId: "cust-1",
            quotationDate: new Date(),
            validUntil: new Date(),
            items: [
              {
                productVariantId: "pv-1",
                quantity: 10,
                unitPrice: 100,
              discountPercent: 0,
              taxPercent: 0,
                enteredQuantity: 1,
                enteredUnit: "box" as any,
                enteredUnitPrice: 100,
                conversionFactorSnapshot: 10,
              },
            ],
          },
          "user-1",
        ),
      ).rejects.toThrow("Unit box is not valid for this product variant");
    });

    it("should throw error for invalid conversion factor", async () => {
      // Arrange
      vi.mocked(prisma.customer.findUnique).mockResolvedValue({
        id: "cust-1",
      } as any);
      vi.mocked(prisma.salesQuotation.count).mockResolvedValue(0);
      vi.mocked(prisma.productVariant.findUnique).mockResolvedValue({
        id: "pv-1",
        primaryUnit: "kg",
        salesUnit: "box",
        conversionFactor: 0,
      } as any);

      // Act & Assert
      await expect(
        QuotationService.createQuotation(
          {
            customerId: "cust-1",
            quotationDate: new Date(),
            validUntil: new Date(),
            items: [
              {
                productVariantId: "pv-1",
                quantity: 10,
                unitPrice: 100,
              discountPercent: 0,
              taxPercent: 0,
                enteredQuantity: 1,
                enteredUnit: "box" as any,
                enteredUnitPrice: 100,
                conversionFactorSnapshot: 10,
              },
            ],
          },
          "user-1",
        ),
      ).rejects.toThrow("Invalid conversion factor for quotation unit");
    });

    it("should throw error for negative conversion factor", async () => {
      // Arrange
      vi.mocked(prisma.customer.findUnique).mockResolvedValue({
        id: "cust-1",
      } as any);
      vi.mocked(prisma.salesQuotation.count).mockResolvedValue(0);
      vi.mocked(prisma.productVariant.findUnique).mockResolvedValue({
        id: "pv-1",
        primaryUnit: "kg",
        salesUnit: "box",
        conversionFactor: -5,
      } as any);

      // Act & Assert
      await expect(
        QuotationService.createQuotation(
          {
            customerId: "cust-1",
            quotationDate: new Date(),
            validUntil: new Date(),
            items: [
              {
                productVariantId: "pv-1",
                quantity: 10,
                unitPrice: 100,
              discountPercent: 0,
              taxPercent: 0,
                enteredQuantity: 1,
                enteredUnit: "box" as any,
                enteredUnitPrice: 100,
                conversionFactorSnapshot: 10,
              },
            ],
          },
          "user-1",
        ),
      ).rejects.toThrow("Invalid conversion factor for quotation unit");
    });

    it("should handle NaN conversion factor by falling back to 1", async () => {
      // Arrange
      vi.mocked(prisma.customer.findUnique).mockResolvedValue({
        id: "cust-1",
      } as any);
      vi.mocked(prisma.salesQuotation.count).mockResolvedValue(0);
      vi.mocked(prisma.productVariant.findUnique).mockResolvedValue({
        id: "pv-1",
        primaryUnit: "kg",
        salesUnit: "box",
        conversionFactor: NaN,
      } as any);
      vi.mocked(prisma.salesQuotation.create).mockResolvedValue({
        id: "sq-1",
      } as any);

      // Act - NaN conversionFactor => decimalToNumber returns fallback=1
      // baseQuantity = 1*1 = 1, baseUnitPrice = 100/1 = 100
      await QuotationService.createQuotation(
        {
          customerId: "cust-1",
          quotationDate: new Date(),
          validUntil: new Date(),
          items: [
            {
              productVariantId: "pv-1",
              quantity: 1,
              unitPrice: 100,
              discountPercent: 0,
              taxPercent: 0,
              enteredQuantity: 1,
              enteredUnit: "box" as any,
              enteredUnitPrice: 100,
              conversionFactorSnapshot: 1,
            },
          ],
        },
        "user-1",
      );

      // Assert
      expect(prisma.salesQuotation.create).toHaveBeenCalled();
    });

    it("should handle conversion factor as string", async () => {
      // Arrange
      vi.mocked(prisma.customer.findUnique).mockResolvedValue({
        id: "cust-1",
      } as any);
      vi.mocked(prisma.salesQuotation.count).mockResolvedValue(0);
      vi.mocked(prisma.productVariant.findUnique).mockResolvedValue({
        id: "pv-1",
        primaryUnit: "kg",
        salesUnit: "box",
        conversionFactor: "5",
      } as any);
      vi.mocked(prisma.salesQuotation.create).mockResolvedValue({
        id: "sq-1",
      } as any);

      // Act - conversionFactor is string "5"
      // baseQuantity = 2 * 5 = 10, baseUnitPrice = 500 / 5 = 100
      await QuotationService.createQuotation(
        {
          customerId: "cust-1",
          quotationDate: new Date(),
          validUntil: new Date(),
          items: [
            {
              productVariantId: "pv-1",
              quantity: 10,
              unitPrice: 100,
              discountPercent: 0,
              taxPercent: 0,
              enteredQuantity: 2,
              enteredUnit: "box" as any,
              enteredUnitPrice: 500,
              conversionFactorSnapshot: 5,
            },
          ],
        },
        "user-1",
      );

      // Assert
      expect(prisma.salesQuotation.create).toHaveBeenCalled();
    });

    it("should handle conversion factor as Decimal object", async () => {
      // Arrange
      vi.mocked(prisma.customer.findUnique).mockResolvedValue({
        id: "cust-1",
      } as any);
      vi.mocked(prisma.salesQuotation.count).mockResolvedValue(0);
      vi.mocked(prisma.productVariant.findUnique).mockResolvedValue({
        id: "pv-1",
        primaryUnit: "kg",
        salesUnit: "box",
        conversionFactor: { toNumber: () => 3 },
      } as any);
      vi.mocked(prisma.salesQuotation.create).mockResolvedValue({
        id: "sq-1",
      } as any);

      // Act - conversionFactor is Decimal-like object
      // baseQuantity = 4 * 3 = 12, baseUnitPrice = 300 / 3 = 100
      await QuotationService.createQuotation(
        {
          customerId: "cust-1",
          quotationDate: new Date(),
          validUntil: new Date(),
          items: [
            {
              productVariantId: "pv-1",
              quantity: 12,
              unitPrice: 100,
              discountPercent: 0,
              taxPercent: 0,
              enteredQuantity: 4,
              enteredUnit: "box" as any,
              enteredUnitPrice: 300,
              conversionFactorSnapshot: 3,
            },
          ],
        },
        "user-1",
      );

      // Assert
      expect(prisma.salesQuotation.create).toHaveBeenCalled();
    });

    it("should handle NaN Decimal conversion factor by falling back to 1", async () => {
      // Arrange
      vi.mocked(prisma.customer.findUnique).mockResolvedValue({
        id: "cust-1",
      } as any);
      vi.mocked(prisma.salesQuotation.count).mockResolvedValue(0);
      vi.mocked(prisma.productVariant.findUnique).mockResolvedValue({
        id: "pv-1",
        primaryUnit: "kg",
        salesUnit: "box",
        conversionFactor: { toNumber: () => NaN },
      } as any);
      vi.mocked(prisma.salesQuotation.create).mockResolvedValue({
        id: "sq-1",
      } as any);

      // Act - Decimal.toNumber() returns NaN => fallback=1, baseQuantity = 1*1 = 1
      await QuotationService.createQuotation(
        {
          customerId: "cust-1",
          quotationDate: new Date(),
          validUntil: new Date(),
          items: [
            {
              productVariantId: "pv-1",
              quantity: 1,
              unitPrice: 100,
              discountPercent: 0,
              taxPercent: 0,
              enteredQuantity: 1,
              enteredUnit: "box" as any,
              enteredUnitPrice: 100,
              conversionFactorSnapshot: 1,
            },
          ],
        },
        "user-1",
      );

      // Assert
      expect(prisma.salesQuotation.create).toHaveBeenCalled();
    });

    it("should handle non-finite Decimal conversion factor gracefully", async () => {
      // Arrange
      vi.mocked(prisma.customer.findUnique).mockResolvedValue({
        id: "cust-1",
      } as any);
      vi.mocked(prisma.salesQuotation.count).mockResolvedValue(0);
      vi.mocked(prisma.productVariant.findUnique).mockResolvedValue({
        id: "pv-1",
        primaryUnit: "kg",
        salesUnit: "box",
        conversionFactor: { toNumber: () => Infinity },
      } as any);
      vi.mocked(prisma.salesQuotation.create).mockResolvedValue({
        id: "sq-1",
      } as any);

      // Act - decimalToNumber returns fallback=1, factor=1, baseQuantity = 5*1 = 5
      await QuotationService.createQuotation(
        {
          customerId: "cust-1",
          quotationDate: new Date(),
          validUntil: new Date(),
          items: [
            {
              productVariantId: "pv-1",
              quantity: 5,
              unitPrice: 100,
              discountPercent: 0,
              taxPercent: 0,
              enteredQuantity: 5,
              enteredUnit: "box" as any,
              enteredUnitPrice: 100,
              conversionFactorSnapshot: 1,
            },
          ],
        },
        "user-1",
      );

      // Assert
      expect(prisma.salesQuotation.create).toHaveBeenCalled();
    });

    it("should handle string conversion factor that is not a number", async () => {
      // Arrange
      vi.mocked(prisma.customer.findUnique).mockResolvedValue({
        id: "cust-1",
      } as any);
      vi.mocked(prisma.salesQuotation.count).mockResolvedValue(0);
      vi.mocked(prisma.productVariant.findUnique).mockResolvedValue({
        id: "pv-1",
        primaryUnit: "kg",
        salesUnit: "box",
        conversionFactor: "not-a-number",
      } as any);
      vi.mocked(prisma.salesQuotation.create).mockResolvedValue({
        id: "sq-1",
      } as any);

      // Act - decimalToNumber returns fallback=1 for "not-a-number"
      await QuotationService.createQuotation(
        {
          customerId: "cust-1",
          quotationDate: new Date(),
          validUntil: new Date(),
          items: [
            {
              productVariantId: "pv-1",
              quantity: 5,
              unitPrice: 100,
              discountPercent: 0,
              taxPercent: 0,
              enteredQuantity: 5,
              enteredUnit: "box" as any,
              enteredUnitPrice: 100,
              conversionFactorSnapshot: 1,
            },
          ],
        },
        "user-1",
      );

      // Assert
      expect(prisma.salesQuotation.create).toHaveBeenCalled();
    });

    it("should handle non-string non-number non-object conversion factor", async () => {
      // Arrange
      vi.mocked(prisma.customer.findUnique).mockResolvedValue({
        id: "cust-1",
      } as any);
      vi.mocked(prisma.salesQuotation.count).mockResolvedValue(0);
      vi.mocked(prisma.productVariant.findUnique).mockResolvedValue({
        id: "pv-1",
        primaryUnit: "kg",
        salesUnit: "box",
        conversionFactor: true,
      } as any);
      vi.mocked(prisma.salesQuotation.create).mockResolvedValue({
        id: "sq-1",
      } as any);

      // Act - decimalToNumber: boolean is not number/string/object, falls through to Number(true) = 1
      await QuotationService.createQuotation(
        {
          customerId: "cust-1",
          quotationDate: new Date(),
          validUntil: new Date(),
          items: [
            {
              productVariantId: "pv-1",
              quantity: 5,
              unitPrice: 100,
              discountPercent: 0,
              taxPercent: 0,
              enteredQuantity: 5,
              enteredUnit: "box" as any,
              enteredUnitPrice: 100,
              conversionFactorSnapshot: 1,
            },
          ],
        },
        "user-1",
      );

      // Assert
      expect(prisma.salesQuotation.create).toHaveBeenCalled();
    });

    it("should throw error when quantity conversion mismatch", async () => {
      // Arrange
      vi.mocked(prisma.customer.findUnique).mockResolvedValue({
        id: "cust-1",
      } as any);
      vi.mocked(prisma.salesQuotation.count).mockResolvedValue(0);
      vi.mocked(prisma.productVariant.findUnique).mockResolvedValue({
        id: "pv-1",
        primaryUnit: "kg",
        salesUnit: "box",
        conversionFactor: 10,
      } as any);

      // Act & Assert - quantity should be 2*10=20 but sent as 10 (mismatch)
      await expect(
        QuotationService.createQuotation(
          {
            customerId: "cust-1",
            quotationDate: new Date(),
            validUntil: new Date(),
            items: [
              {
                productVariantId: "pv-1",
                quantity: 10,
                unitPrice: 100,
              discountPercent: 0,
              taxPercent: 0,
                enteredQuantity: 2,
                enteredUnit: "box" as any,
                enteredUnitPrice: 100,
                conversionFactorSnapshot: 10,
              },
            ],
          },
          "user-1",
        ),
      ).rejects.toThrow("Quotation quantity conversion mismatch");
    });

    it("should throw error when unit price conversion mismatch", async () => {
      // Arrange
      vi.mocked(prisma.customer.findUnique).mockResolvedValue({
        id: "cust-1",
      } as any);
      vi.mocked(prisma.salesQuotation.count).mockResolvedValue(0);
      vi.mocked(prisma.productVariant.findUnique).mockResolvedValue({
        id: "pv-1",
        primaryUnit: "kg",
        salesUnit: "box",
        conversionFactor: 10,
      } as any);

      // Act & Assert - unitPrice should be 1000/10=100 but sent as 200 (mismatch)
      await expect(
        QuotationService.createQuotation(
          {
            customerId: "cust-1",
            quotationDate: new Date(),
            validUntil: new Date(),
            items: [
              {
                productVariantId: "pv-1",
                quantity: 20,
                unitPrice: 200,
              discountPercent: 0,
              taxPercent: 0,
                enteredQuantity: 2,
                enteredUnit: "box" as any,
                enteredUnitPrice: 1000,
                conversionFactorSnapshot: 10,
              },
            ],
          },
          "user-1",
        ),
      ).rejects.toThrow("Quotation unit price conversion mismatch");
    });

    it("should throw error when conversion factor snapshot mismatch", async () => {
      // Arrange
      vi.mocked(prisma.customer.findUnique).mockResolvedValue({
        id: "cust-1",
      } as any);
      vi.mocked(prisma.salesQuotation.count).mockResolvedValue(0);
      vi.mocked(prisma.productVariant.findUnique).mockResolvedValue({
        id: "pv-1",
        primaryUnit: "kg",
        salesUnit: "box",
        conversionFactor: 10,
      } as any);

      // Act & Assert - conversionFactorSnapshot sent as 5 but actual is 10
      await expect(
        QuotationService.createQuotation(
          {
            customerId: "cust-1",
            quotationDate: new Date(),
            validUntil: new Date(),
            items: [
              {
                productVariantId: "pv-1",
                quantity: 20,
                unitPrice: 100,
              discountPercent: 0,
              taxPercent: 0,
                enteredQuantity: 2,
                enteredUnit: "box" as any,
                enteredUnitPrice: 1000,
                conversionFactorSnapshot: 5,
              },
            ],
          },
          "user-1",
        ),
      ).rejects.toThrow("Quotation conversion factor mismatch");
    });

    it("should default discount and tax to zero when not provided", async () => {
      // Arrange
      vi.mocked(prisma.customer.findUnique).mockResolvedValue({
        id: "cust-1",
      } as any);
      vi.mocked(prisma.salesQuotation.count).mockResolvedValue(0);
      vi.mocked(prisma.productVariant.findUnique).mockResolvedValue({
        id: "pv-1",
        primaryUnit: "kg",
        salesUnit: null,
        conversionFactor: null,
      } as any);
      vi.mocked(prisma.salesQuotation.create).mockResolvedValue({
        id: "sq-1",
      } as any);

      // Act
      await QuotationService.createQuotation(
        {
          customerId: "cust-1",
          quotationDate: new Date(),
          validUntil: new Date(),
          items: [
            {
              productVariantId: "pv-1",
              quantity: 5,
              unitPrice: 200,
              discountPercent: 0,
              taxPercent: 0,
            },
          ],
        },
        "user-1",
      );

      // Assert
      expect(prisma.salesQuotation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalAmount: 1000,
            discountAmount: 0,
            taxAmount: 0,
          }),
        }),
      );
    });
  });

  // ----------------------------------------------------------------
  // convertToOrder
  // ----------------------------------------------------------------
  describe("convertToOrder", () => {
    it("should convert quotation to sales order", async () => {
      // Arrange
      const year = new Date().getFullYear();
      const mockQuotation = {
        id: "sq-1",
        quotationNumber: `SQ-${year}-0001`,
        customerId: "cust-1",
        totalAmount: 1000,
        discountAmount: 0,
        taxAmount: 0,
        status: "SENT",
        notes: "Test quotation",
        items: [
          {
            productVariantId: "pv-1",
            quantity: 10,
            unitPrice: 100,
            enteredQuantity: null,
            enteredUnit: null,
            conversionFactorSnapshot: null,
            enteredUnitPrice: null,
            discountPercent: 0,
            taxPercent: 0,
            taxAmount: 0,
            subtotal: 1000,
          },
        ],
      };

      const mockOrder = {
        id: "so-1",
        orderNumber: `SO-${year}-0001`,
        status: "DRAFT",
      };

      vi.mocked(prisma.salesQuotation.findUnique).mockResolvedValue(
        mockQuotation as any,
      );
      vi.mocked(prisma.salesQuotation.update).mockResolvedValue({} as any);
      vi.mocked(prisma.salesOrder.count).mockResolvedValue(0);
      vi.mocked(prisma.salesOrder.create).mockResolvedValue(mockOrder as any);

      // Act
      const result = await QuotationService.convertToOrder(
        "sq-1",
        "user-1",
        "loc-1",
      );

      // Assert
      expect(result).toEqual(mockOrder);
      expect(prisma.salesOrder.create).toHaveBeenCalled();
    });

    it("should throw error when quotation not found", async () => {
      // Arrange
      vi.mocked(prisma.salesQuotation.findUnique).mockResolvedValue(null);

      // Act & Assert
      await expect(
        QuotationService.convertToOrder("sq-999", "user-1", "loc-1"),
      ).rejects.toThrow("Sales Quotation");
    });

    it("should throw error when quotation already converted", async () => {
      // Arrange
      vi.mocked(prisma.salesQuotation.findUnique).mockResolvedValue({
        id: "sq-1",
        status: "CONVERTED",
      } as any);

      // Act & Assert
      await expect(
        QuotationService.convertToOrder("sq-1", "user-1", "loc-1"),
      ).rejects.toThrow("Quotation already converted");
    });

    it("should throw error when quotation expired", async () => {
      // Arrange
      vi.mocked(prisma.salesQuotation.findUnique).mockResolvedValue({
        id: "sq-1",
        status: "EXPIRED",
      } as any);

      // Act & Assert
      await expect(
        QuotationService.convertToOrder("sq-1", "user-1", "loc-1"),
      ).rejects.toThrow("Quotation expired");
    });

    it("should throw error when quotation rejected", async () => {
      // Arrange
      vi.mocked(prisma.salesQuotation.findUnique).mockResolvedValue({
        id: "sq-1",
        status: "REJECTED",
      } as any);

      // Act & Assert
      await expect(
        QuotationService.convertToOrder("sq-1", "user-1", "loc-1"),
      ).rejects.toThrow("Quotation was rejected");
    });

    it("should update quotation status to CONVERTED after creating order", async () => {
      // Arrange
      const year = new Date().getFullYear();
      const mockQuotation = {
        id: "sq-1",
        quotationNumber: `SQ-${year}-0001`,
        customerId: "cust-1",
        totalAmount: 1000,
        discountAmount: 100,
        taxAmount: 50,
        status: "SENT",
        notes: null,
        items: [
          {
            productVariantId: "pv-1",
            quantity: 10,
            unitPrice: 100,
            enteredQuantity: null,
            enteredUnit: null,
            conversionFactorSnapshot: null,
            enteredUnitPrice: null,
            discountPercent: 0,
            taxPercent: 0,
            taxAmount: 0,
            subtotal: 1000,
          },
        ],
      };

      const mockOrder = {
        id: "so-1",
        orderNumber: `SO-${year}-0001`,
      };

      vi.mocked(prisma.salesQuotation.findUnique).mockResolvedValue(
        mockQuotation as any,
      );
      vi.mocked(prisma.salesQuotation.update).mockResolvedValue({} as any);
      vi.mocked(prisma.salesOrder.count).mockResolvedValue(0);
      vi.mocked(prisma.salesOrder.create).mockResolvedValue(mockOrder as any);

      // Act
      await QuotationService.convertToOrder("sq-1", "user-1", "loc-1");

      // Assert
      expect(prisma.salesQuotation.update).toHaveBeenCalledWith({
        where: { id: "sq-1" },
        data: { status: "CONVERTED" },
      });
    });

    it("should generate order number with correct sequence when orders exist", async () => {
      // Arrange
      const year = new Date().getFullYear();
      const mockQuotation = {
        id: "sq-1",
        quotationNumber: `SQ-${year}-0001`,
        customerId: "cust-1",
        totalAmount: 500,
        discountAmount: 0,
        taxAmount: 0,
        status: "SENT",
        notes: null,
        items: [],
      };

      vi.mocked(prisma.salesQuotation.findUnique).mockResolvedValue(
        mockQuotation as any,
      );
      vi.mocked(prisma.salesQuotation.update).mockResolvedValue({} as any);
      vi.mocked(prisma.salesOrder.count).mockResolvedValue(9);
      vi.mocked(prisma.salesOrder.create).mockResolvedValue({
        id: "so-1",
      } as any);

      // Act
      await QuotationService.convertToOrder("sq-1", "user-1", "loc-1");

      // Assert
      expect(prisma.salesOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderNumber: `SO-${year}-0010`,
          }),
        }),
      );
    });

    it("should include quotation notes in order notes when present", async () => {
      // Arrange
      const year = new Date().getFullYear();
      const mockQuotation = {
        id: "sq-1",
        quotationNumber: `SQ-${year}-0001`,
        customerId: "cust-1",
        totalAmount: 500,
        discountAmount: 0,
        taxAmount: 0,
        status: "SENT",
        notes: "Special delivery instructions",
        items: [],
      };

      vi.mocked(prisma.salesQuotation.findUnique).mockResolvedValue(
        mockQuotation as any,
      );
      vi.mocked(prisma.salesQuotation.update).mockResolvedValue({} as any);
      vi.mocked(prisma.salesOrder.count).mockResolvedValue(0);
      vi.mocked(prisma.salesOrder.create).mockResolvedValue({
        id: "so-1",
      } as any);

      // Act
      await QuotationService.convertToOrder("sq-1", "user-1", "loc-1");

      // Assert
      expect(prisma.salesOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            notes: `From Quotation SQ-${year}-0001\nSpecial delivery instructions`,
          }),
        }),
      );
    });

    it("should use only quotation number in order notes when notes are null", async () => {
      // Arrange
      const year = new Date().getFullYear();
      const mockQuotation = {
        id: "sq-1",
        quotationNumber: `SQ-${year}-0001`,
        customerId: "cust-1",
        totalAmount: 500,
        discountAmount: 0,
        taxAmount: 0,
        status: "SENT",
        notes: null,
        items: [],
      };

      vi.mocked(prisma.salesQuotation.findUnique).mockResolvedValue(
        mockQuotation as any,
      );
      vi.mocked(prisma.salesQuotation.update).mockResolvedValue({} as any);
      vi.mocked(prisma.salesOrder.count).mockResolvedValue(0);
      vi.mocked(prisma.salesOrder.create).mockResolvedValue({
        id: "so-1",
      } as any);

      // Act
      await QuotationService.convertToOrder("sq-1", "user-1", "loc-1");

      // Assert
      expect(prisma.salesOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            notes: `From Quotation SQ-${year}-0001`,
          }),
        }),
      );
    });

    it("should pass source location id to the order", async () => {
      // Arrange
      const year = new Date().getFullYear();
      const mockQuotation = {
        id: "sq-1",
        quotationNumber: `SQ-${year}-0001`,
        customerId: "cust-1",
        totalAmount: 200,
        discountAmount: 0,
        taxAmount: 0,
        status: "DRAFT",
        notes: null,
        items: [],
      };

      vi.mocked(prisma.salesQuotation.findUnique).mockResolvedValue(
        mockQuotation as any,
      );
      vi.mocked(prisma.salesQuotation.update).mockResolvedValue({} as any);
      vi.mocked(prisma.salesOrder.count).mockResolvedValue(0);
      vi.mocked(prisma.salesOrder.create).mockResolvedValue({
        id: "so-1",
      } as any);

      // Act
      await QuotationService.convertToOrder(
        "sq-1",
        "user-1",
        "warehouse-loc-42",
      );

      // Assert
      expect(prisma.salesOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sourceLocationId: "warehouse-loc-42",
          }),
        }),
      );
    });

    it("should set order type to MAKE_TO_ORDER", async () => {
      // Arrange
      const year = new Date().getFullYear();
      const mockQuotation = {
        id: "sq-1",
        quotationNumber: `SQ-${year}-0001`,
        customerId: "cust-1",
        totalAmount: 200,
        discountAmount: 0,
        taxAmount: 0,
        status: "DRAFT",
        notes: null,
        items: [],
      };

      vi.mocked(prisma.salesQuotation.findUnique).mockResolvedValue(
        mockQuotation as any,
      );
      vi.mocked(prisma.salesQuotation.update).mockResolvedValue({} as any);
      vi.mocked(prisma.salesOrder.count).mockResolvedValue(0);
      vi.mocked(prisma.salesOrder.create).mockResolvedValue({
        id: "so-1",
      } as any);

      // Act
      await QuotationService.convertToOrder("sq-1", "user-1", "loc-1");

      // Assert
      expect(prisma.salesOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderType: SalesOrderType.MAKE_TO_ORDER,
            status: SalesOrderStatus.DRAFT,
          }),
        }),
      );
    });

    it("should copy quotation items to order with all fields", async () => {
      // Arrange
      const year = new Date().getFullYear();
      const mockQuotation = {
        id: "sq-1",
        quotationNumber: `SQ-${year}-0001`,
        customerId: "cust-1",
        totalAmount: 1000,
        discountAmount: 50,
        taxAmount: 95,
        status: "SENT",
        notes: null,
        items: [
          {
            productVariantId: "pv-1",
            quantity: 20,
            unitPrice: 50,
            enteredQuantity: 2,
            enteredUnit: "box",
            conversionFactorSnapshot: 10,
            enteredUnitPrice: 500,
            discountPercent: 5,
            taxPercent: 10,
            taxAmount: 95,
            subtotal: 1000,
          },
        ],
      };

      vi.mocked(prisma.salesQuotation.findUnique).mockResolvedValue(
        mockQuotation as any,
      );
      vi.mocked(prisma.salesQuotation.update).mockResolvedValue({} as any);
      vi.mocked(prisma.salesOrder.count).mockResolvedValue(0);
      vi.mocked(prisma.salesOrder.create).mockResolvedValue({
        id: "so-1",
      } as any);

      // Act
      await QuotationService.convertToOrder("sq-1", "user-1", "loc-1");

      // Assert
      expect(prisma.salesOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalAmount: 1000,
            discountAmount: 50,
            taxAmount: 95,
            items: {
              create: [
                {
                  productVariantId: "pv-1",
                  quantity: 20,
                  unitPrice: 50,
                  enteredQuantity: 2,
                  enteredUnit: "box",
                  conversionFactorSnapshot: 10,
                  enteredUnitPrice: 500,
                  discountPercent: 5,
                  taxPercent: 10,
                  taxAmount: 95,
                  subtotal: 1000,
                },
              ],
            },
          }),
        }),
      );
    });
  });
});
